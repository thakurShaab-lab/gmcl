/** modules/api/controllers/Products.php (class Products extends Api_Controller) */
const { sql } = require('drizzle-orm');
const productModel = require('../model/product.model');
const attributeModel = require('../model/product.attribute.model');
const categoryModel = require('../model/category.model');
const { getDbFieldValue, getDbSingleRow, countRecord, getFoundRows, fetchAll, safeInsert } = require('../model/common.model');
const { getProductPrice, productOverallRating, displaySymbol, getContent } = require('../model/helper.model');
const { wlReview, wlEnquiry } = require('../schema');
const { str, num, intval, isNumeric, empty, eq, neq, toBool, trim, round, nl2br } = require('../utils/php');
const { getDateFormat, getYoutubeId } = require('../utils/helpers');
const { xssClean } = require('../utils/xssClean');
const { mailNotify } = require('../utils/mailer');

const { SqlText } = productModel;
const CONTROLLER_FILE = 'modules/api/controllers/Products.php';

/* ------------------------------------------------------------------ PHP helpers */

/** PHP string conversion that also maps request arrays (JS arrays / objects) to "Array". */
const s = (v) => (v !== null && typeof v === 'object' ? 'Array' : str(v));
const isArr = (v) => v !== null && typeof v === 'object';

/** PHP 7 comparison ($a <=> $b) for scalars coming from the request / database. */
function cmp(a, b) {
  if (a === undefined) a = null;
  if (b === undefined) b = null;
  if (isArr(a) || isArr(b)) {
    if (isArr(a) && isArr(b)) return 0;
    return isArr(a) ? 1 : -1;
  }
  const sign = (x) => (x > 0 ? 1 : x < 0 ? -1 : 0);
  if (a === null && typeof b === 'string') a = '';
  else if (b === null && typeof a === 'string') b = '';
  if (typeof a === 'boolean' || typeof b === 'boolean' || a === null || b === null) {
    return Number(toBool(a)) - Number(toBool(b));
  }
  if (typeof a === 'string' && typeof b === 'string') {
    if (isNumeric(a) && isNumeric(b)) return sign(Number(a) - Number(b));
    return sign(Buffer.compare(Buffer.from(a), Buffer.from(b)));
  }
  return sign(num(a) - num(b));
}
const gt = (a, b) => cmp(a, b) > 0;
const le = (a, b) => cmp(a, b) <= 0;

/** str_replace($search, $replace, $subject) for string subjects (search may be a list). */
function strReplace(search, replace, subject) {
  let out = s(subject);
  for (const needle of Array.isArray(search) ? search : [search]) {
    const n = str(needle);
    if (n !== '') out = out.split(n).join(str(replace));
  }
  return out;
}

/** str_replace(NULL, '', $row): every scalar value becomes a string (null -> ""). */
function stringifyRow(row) {
  const out = {};
  for (const [k, v] of Object.entries(row)) out[k] = isArr(v) ? v : str(v);
  return out;
}

/** site_url($uri) with index_page '' and no url_suffix. */
function siteUrl(ci, uri) {
  if (empty(uri)) return ci.baseUrl();
  return ci.baseUrl() + trim(str(uri), '/');
}

/** The low_stock / out_of_stock / available_quantity block computed from get_product_price(). */
function stockInfo(priceRes) {
  let lowStock = 0;
  let outOfStock = 0;
  let availableQuantity = 0;
  if (priceRes) {
    lowStock = le(priceRes.product_quantity, priceRes.inventory) && gt(priceRes.product_quantity, 0) ? 1 : 0;
    outOfStock = eq(priceRes.product_quantity, 0) ? 1 : 0;
    availableQuantity = priceRes.product_quantity;
  }
  let isStock = '0';
  if (lowStock > 0) isStock = '1';
  else if (outOfStock > 0) isStock = '2';
  return { available_quantity: availableQuantity, low_stock: lowStock, out_of_stock: outOfStock, is_stock: isStock };
}

/** "AND product_id='<id>'" for get_product_price() */
const productCond = (productId) => sql`AND product_id=${str(productId)}`;

/** Form-validation failure text: str_replace(array("&nbsp;", "\n"), "", @$err_arr[0]) */
function firstErrorText(ci, line) {
  // MY_Form_validation redeclares $_error_array without a default, so web_service_validation_errors_list() returns
  // NULL while no error was recorded (run() on an empty POST); an unsuppressed array_values(NULL) then warns
  // (PHP 5.6). `line` = that array_values() line, or undefined where PHP used @array_values().
  if (line && ci.fv.errorList().size === 0) {
    ci.out.phpWarning('array_values() expects parameter 1 to be array, null given', 'controllers/Products.php', line, {
      frames: [null, null, null, { file: CONTROLLER_FILE, line, fn: 'array_values' }, null, null, { file: 'index.php', line: 304, fn: 'require_once' }],
    });
  }
  return strReplace(['&nbsp;', '\n'], '', ci.fv.firstError());
}

function imagePaths(ci, data) {
  data.product_image_path = `${ci.baseUrl()}uploaded_files/products`;
  data.product_no_image_path = `${ci.baseUrl()}uploaded_files/products/noimg.png`;
  data.category_image_path = `${ci.baseUrl()}uploaded_files/categories`;
  data.category_no_image_path = `${ci.baseUrl()}uploaded_files/products/noimg.png`;
  data.brand_image_path = `${ci.baseUrl()}uploaded_files/brand`;
}

/* ------------------------------------------------------------------ listing (index / product_paging) */

/** Adds " AND ( <prefix>'<id>'<suffix> OR ... )" for a comma separated request list, like the PHP loops. */
function addIdList(where, value, prefix, suffix) {
  if (!toBool(value) || isArr(value)) return null;
  const ids = str(value).split(',');
  if (!(gt(ids[0], 0) && ids[0] !== '')) return null;
  where.raw(' AND ( ');
  for (const id of ids) where.raw(prefix).param(id).raw(suffix);
  where.chop(3);
  where.raw(' )');
  return ids[ids.length - 1];
}

const EFFECTIVE_PRICE = 'IF(wlp.product_discounted_price>0 , wlp.product_discounted_price,wlp.product_price)';

/** The shared body of index() and product_paging(). */
async function productListing(ci, paging) {
  const { db } = ci;
  const currSymbol = await displaySymbol(db);
  const keyword = ci.input.getPost('keyword');
  let categoryId = intval(ci.input.getPost('category_id'));
  const subcategoryId = intval(ci.input.getPost('subcategory_id'));
  const prange = strReplace(currSymbol, '', ci.input.getPost('amount', true));

  const condition = { status: '1' };
  const where = new SqlText(" wlp.status ='1' ");
  if (gt(ci.input.getPost('is_featured'), 0)) where.raw(" AND wlp.is_featured ='1' ");
  if (gt(ci.input.getPost('is_trending'), 0)) where.raw(" AND wlp.is_trending ='1' ");
  if (toBool(keyword)) {
    where.raw(' AND (wlp.product_name LIKE ').param(`%${s(keyword)}%`).raw(' OR  wlp.product_code LIKE ').param(`%${s(keyword)}%`).raw(' )');
  }

  categoryId = subcategoryId > 0 ? subcategoryId : categoryId;
  if (neq(categoryId, '')) condition.category_id = categoryId;

  const sizeIds = ci.input.getPost('size_id', true);
  if (neq(sizeIds, '')) condition.size_ids = sizeIds;
  const colorIds = ci.input.getPost('color_id', true);
  if (neq(colorIds, '')) condition.color_ids = colorIds;
  let brandId = ci.input.getPost('brand_id', true);
  if (neq(brandId, '')) condition.brand_id = brandId;

  addIdList(where, ci.input.getPost('category_ids', true), 'FIND_IN_SET( ', ',wlp.category_links ) OR ');
  const lastBrand = addIdList(where, ci.input.getPost('brand_ids', true), 'wlp.brand_id =', ' OR ');
  if (lastBrand !== null) brandId = lastBrand; // the PHP foreach reused $brand_id as its loop variable
  addIdList(where, ci.input.getPost('producer_id', true), 'wlp.producer_id =', ' OR ');
  addIdList(where, ci.input.getPost('certificate_authority_id', true), 'wlp.certificate_authority_id =', ' OR ');

  if (prange !== '') {
    where.raw(' AND (');
    for (const piece of prange.split(',')) {
      if (piece.includes('>')) {
        const arr = piece.split('>');
        if (isNumeric(arr[1])) {
          where.raw(' ( IF(wlp.product_discounted_price>0, wlp.product_discounted_price,wlp.product_price) > ').param(arr[1]).raw(' ) OR ');
        }
      }
      if (piece.includes('<')) {
        const arr = piece.split('<');
        if (isNumeric(arr[1])) where.raw(` ( ${EFFECTIVE_PRICE} < `).param(arr[1]).raw(' ) OR ');
      }
      if (piece.includes('-')) {
        const arr = piece.split('-');
        const min = trim(arr[0]);
        const max = trim(arr[1]);
        if (isNumeric(min) && isNumeric(max)) {
          where.raw(` ( ${EFFECTIVE_PRICE} > `).param(min).raw(` AND ( ${EFFECTIVE_PRICE} < `).param(max).raw(' ) ) OR ');
        }
      }
    }
    where.chop(4);
    where.raw(' )');
  }

  if (eq(ci.input.getPost('is_popular'), 'Popular Product')) where.raw(" AND wlp.is_popular = '1' ");
  if (eq(ci.input.getPost('is_choice'), 'Choice Product')) where.raw(" AND wlp.is_choice = '1' ");
  if (eq(ci.input.getPost('is_favorite'), 'Favorite Product')) where.raw(" AND wlp.is_favorite = '1' ");
  if (eq(ci.input.getPost('is_recommadation'), 'Recommadation Product')) where.raw(" AND wlp.is_recommadation = '1' ");

  const perPage = 20;
  let offset = 0;
  let resArray;
  let totalRows;
  const productsId = ci.input.post('products_id');
  if (paging) {
    offset = intval(ci.input.getPost('offset'));
    offset = offset <= 0 ? 1 : offset;
  }
  const offsetRec = (offset - 1) * perPage;
  if (gt(productsId, 0)) {
    const wish = { wish_user_id: ci.userId };
    if (paging) {
      const related = await productModel.relatedProducts(ci, s(productsId), offsetRec, perPage, wish, { withTotal: true });
      resArray = related.rows;
      totalRows = related.total;
    } else {
      resArray = (await productModel.relatedProducts(ci, s(productsId), 0, 100000, wish)).rows;
      totalRows = resArray.length;
    }
  } else {
    condition.where = where;
    condition.wish_user_id = ci.userId;
    resArray = paging
      ? await productModel.getProducts(ci, perPage, offsetRec, condition)
      : await productModel.getProducts(ci, '', 0, condition);
    totalRows = await getFoundRows(db);
  }

  const catName = await getDbFieldValue(db, 'wl_categories', 'category_name', sql` AND category_id=${str(categoryId)} `);
  const categoryImage = await getDbFieldValue(db, 'wl_categories', 'category_image', sql` AND category_id=${str(categoryId)}`);
  const brandRes = gt(brandId, 0) ? await getDbSingleRow(db, 'wl_brands', '*', sql` AND brand_id=${s(brandId)} `, ci.out) : [];

  const data = {};
  if (resArray.length) {
    data.success = 'true';
    data.total_product = totalRows;
    data.category_id = categoryId;
    data.category_name = catName;
    data.category_image = categoryImage;
    data.brand_res = brandRes;
    const out = [];
    for (const row of resArray) {
      const v = { ...row };
      let isCart = '0';
      if (gt(ci.userId, 0)) {
        const countCart = await countRecord(db, 'tbl_temp_cart', sql`user_id = ${str(ci.userId)} AND pid = ${str(v.products_id)} `);
        if (countCart > 0) isCart = '1';
      }
      v.is_cart = isCart;
      const media = await productModel.firstMedia(db, v.products_id);
      if (media.length > 0) {
        v.media = neq(media[0].media, '') && productModel.productMediaExists(media[0].media) ? media[0].media : '';
      }
      Object.assign(v, stockInfo(await getProductPrice(db, productCond(v.products_id))));
      out.push(stringifyRow(v));
    }
    data.res = out;
  } else {
    data.success = 'false';
    data.total_product = totalRows;
    data.res = [];
    data.category_id = categoryId;
    data.category_name = catName;
    data.category_image = categoryImage;
    data.error = ci.lang('no_record_found');
  }
  if (paging) {
    data.total_pages = Math.ceil(num(totalRows) / perPage);
    data.offset = offset;
  }
  imagePaths(ci, data);
  ci.out.json(data, 'false');
}

/** /api/products, /api/products/index — full product listing with filters (no paging). */
async function index(req) {
  return productListing(req.ci, false);
}

/** /api/products/product_paging — the same listing, 20 per page (offset = page number). */
async function productPaging(req) {
  return productListing(req.ci, true);
}

/** /api/products/suggestion_search — keyword */
async function suggestionSearch(req) {
  const { ci } = req;
  const keyword = trim(ci.input.getPost('keyword', true));
  let where = sql` where status ='1' `;
  if (toBool(keyword)) where = sql`${where} AND (product_name LIKE ${`%${keyword}%`} OR  product_code LIKE ${`%${keyword}%`} )`;
  const rows = await fetchAll(ci.db, sql`select product_name,products_id from wl_products ${where} `);
  const data = {};
  if (rows.length) {
    data.success = 'true';
    data.total_product = rows.length;
    data.res = rows;
  } else {
    data.success = 'false';
    data.total_product = '0';
    data.res = [];
    data.error = ci.lang('no_record_found');
  }
  ci.out.json(data, 'false');
}

/** /api/products/get_size_price_old — calls get_product_stock_price(), which does not exist (fatal Error). */
async function getSizePriceOld(req) {
  const { ci } = req;
  const pColor = intval(ci.input.getPost('color_id'));
  const pSize = intval(ci.input.getPost('attribute_id'));
  const productsId = intval(ci.input.getPost('products_id'));
  let data;
  if (productsId > 0) {
    await getDbSingleRow(ci.db, 'wl_products', '*', sql` AND products_id=${str(productsId)} `, ci.out);
    let line = null;
    if (pSize > 0 && pColor > 0) line = 748;
    else if (pSize > 0 && pColor === 0) line = 758;
    else if (pColor > 0 && pSize === 0) line = 767;
    else if (pSize === 0 && pColor === 0) line = 776;
    if (line !== null) {
      ci.out.fatalError('Call to undefined function get_product_stock_price()', CONTROLLER_FILE, line);
    }
    // Negative ids reach no branch: every price variable is undefined (NULL).
    data = { success: 'true', product_price: null, product_discounted_price: null, product_quantity: null, price: null };
  } else {
    data = { success: 'false', error: 'parameter missing' };
  }
  ci.out.json(data);
}

/** /api/products/detail — products_id, action=price_change (prod_size, prod_color), keyword (reviews) */
async function detail(req) {
  const { ci } = req;
  const { db } = ci;
  const productId = intval(ci.input.getPost('products_id'));
  const res = await productModel.getProducts(ci, 1, 0, { productid: productId, wish_user_id: ci.userId });
  const data = {};
  if (!res) {
    data.success = 'false';
    data.error = ci.lang('no_record_found');
    ci.out.json(data);
    return;
  }
  data.success = 'true';
  let isCart = '0';
  if (gt(ci.userId, 0)) {
    const countCart = await countRecord(db, 'tbl_temp_cart', sql`user_id = ${str(ci.userId)} AND pid = ${str(res.products_id)} `);
    if (countCart > 0) isCart = '1';
  }
  res.is_cart = isCart;

  const youtubeId = getYoutubeId(res.video_url);
  let embedLink = '';
  if (neq(res.video_url, '')) {
    const embedCode = youtubeId;
    embedLink = 'https://www.youtube.com/embed/';
    const embed = embedCode.includes('https://youtu.be/')
      ? strReplace('https://youtu.be/', '', embedCode)
      : strReplace('https://www.youtube.com/watch?v=', '', embedCode);
    embedLink += embed;
  }
  res.video_url = embedLink;
  data.product_res = res;
  data.share_url = ci.baseUrl() + str(res.friendly_url);

  const wish = { wish_user_id: ci.userId };
  const related = (await productModel.relatedProducts(ci, res.products_id, 0, 6, wish)).rows;
  if (related.length) data.related_products = related.map(stringifyRow);
  const allRelated = (await productModel.relatedProducts(ci, res.products_id, 0, '', wish)).rows;
  if (allRelated.length) data.all_related_products = allRelated.map(stringifyRow);

  const mediaRes = await productModel.productMedia(db, res.products_id);
  data.media_res = mediaRes || [];
  const querySize = await productModel.getProductSizes(db, res.products_id);
  const productColors = await productModel.getProductColors(db, res.products_id);
  data.sizes_array = querySize && querySize.length ? querySize : [];
  data.colors_array = productColors && productColors.length ? productColors : [];

  data.media_count = mediaRes ? mediaRes.length : 0;
  data.size_count = querySize.length;
  data.color_count = productColors.length;

  let productPrice = res.product_price;
  let productDiscountedPrice = res.product_discounted_price;
  let cond = productCond(res.products_id);

  if (eq(ci.input.getPost('action'), 'price_change')) {
    ci.fv.setRules('prod_color', 'Color', productColors.length > 0 ? 'trim|required' : 'trim');
    ci.fv.setRules('prod_size', 'Size', querySize.length > 0 ? 'trim|required' : 'trim');
    if (await ci.fv.run()) {
      const prodSize = ci.input.getPost('prod_size');
      if (toBool(prodSize)) cond = sql`${cond} AND product_size=${s(prodSize)}`;
      const prodColor = ci.input.getPost('prod_color');
      if (toBool(prodColor)) cond = sql`${cond} AND product_color=${s(prodColor)}`;
    } else {
      data.success = 'false';
      data.error = firstErrorText(ci, 986);
    }
  }

  const priceRes = await getProductPrice(db, cond);
  if (priceRes && gt(priceRes.product_price, 0)) {
    productPrice = priceRes.product_price;
    productDiscountedPrice = priceRes.product_discounted_price;
  }
  Object.assign(data, stockInfo(priceRes));
  data.product_price = productPrice;
  data.product_discounted_price = productDiscountedPrice;
  data.product_url = siteUrl(ci, res.friendly_url);

  const listReview = await productModel.getReviews(ci, '3', '0', { entity_id: res.products_id, rev_status: '1', rev_type: 'P' });
  data.review_count = listReview.length;
  data.list_review = listReview.map((r) => ({ ...r, posted_date: getDateFormat(r.posted_date, 1) }));

  const averageRating = await productOverallRating(db, res.products_id);
  data.overall_rating = round(num(averageRating), 1);

  data.currency_code = await getDbFieldValue(db, 'wl_currencies', 'code', { is_default: 'Y' });
  data.currency_symbol_left = await getDbFieldValue(db, 'wl_currencies', 'symbol_left', { is_default: 'Y' });

  data.stock_res = await stockList(ci, res.products_id);
  data.product_image_path = `${ci.baseUrl()}uploaded_files/products`;
  data.product_no_image_path = `${ci.baseUrl()}uploaded_files/products/noimg.png`;
  ci.out.json(data);
}

/** product_id_stock_list() rows with size_name / color_name / price added ([] when there are none). */
async function stockList(ci, productId, rows) {
  const list = rows === undefined ? await productModel.productIdStockList(ci.db, productId) : rows;
  if (!list) return [];
  const out = [];
  for (const val of list) {
    const sizeRow = await getDbSingleRow(ci.db, 'wl_sizes', 'size_name', sql` AND size_id=${str(val.product_size)} `, ci.out);
    const colorRow = await getDbSingleRow(ci.db, 'wl_colors', 'color_name', sql` AND color_id=${str(val.product_color)} `, ci.out);
    out.push({
      ...val,
      size_name: eq(val.product_size, 0) ? 'N/A' : sizeRow ? sizeRow.size_name : null,
      color_name: eq(val.product_color, 0) ? 'N/A' : colorRow ? colorRow.color_name : null,
      price: gt(val.product_discounted_price, 0) ? val.product_discounted_price : val.product_price,
    });
  }
  return out;
}

/** /api/products/get_view_stock — products_id */
async function getViewStock(req) {
  const { ci } = req;
  const productsId = intval(ci.input.getPost('products_id'));
  const data = {};
  if (productsId > 0) {
    const resArray = await productModel.productIdStockList(ci.db, productsId);
    const productRes = await getDbSingleRow(ci.db, 'wl_products', 'product_name,product_code,products_id', sql` AND products_id=${str(productsId)}`, ci.out);
    data.product_name = productRes ? productRes.product_name : null;
    data.product_code = productRes ? productRes.product_code : null;
    if (resArray) {
      data.total_records = resArray.length;
      data.res = await stockList(ci, productsId, resArray);
      data.success = 'true';
    } else {
      data.success = 'false';
      data.total_records = 1; // count(false)
      data.res = [];
    }
  } else {
    data.success = 'false';
    data.error = 'parameter missing';
  }
  ci.out.json(data);
}

/** /api/products/get_product_review — products_id, keyword */
async function getProductReview(req) {
  const { ci } = req;
  const productsId = intval(ci.input.getPost('products_id'));
  const data = {};
  if (productsId > 0) {
    const listReview = await productModel.getReviews(ci, '10000', '0', { entity_id: productsId, rev_status: '1', rev_type: 'P' });
    if (listReview.length) {
      data.review_count = listReview.length;
      data.list_review = listReview.map((r) => ({ ...r, posted_date: getDateFormat(r.posted_date, 1) }));
      data.success = 'true';
    } else {
      data.success = 'false';
      data.review_count = 0;
      data.list_review = [];
    }
  } else {
    data.success = 'false';
    data.error = 'parameter missing';
  }
  ci.out.json(data);
}

/** /api/products/product_review_post — prod_id, action=post_review, poster_name, email, rating, comment (login) */
async function productReviewPost(req) {
  const { ci } = req;
  const prodId = ci.input.getPost('prod_id');
  const userPostId = ci.userId;
  const data = {};
  if (gt(prodId, 0)) {
    if (gt(userPostId, 0)) {
      if (eq(ci.input.getPost('action'), 'post_review')) {
        ci.fv.setRules('poster_name', 'Name', 'trim|alpha|required|max_length[100]');
        ci.fv.setRules('email', 'Email', 'trim|required|valid_email|max_length[80]');
        ci.fv.setRules('rating', 'Select Rating', 'trim|required|numeric');
        ci.fv.setRules('comment', 'Review', 'trim|required|max_length[1000]');
        if (await ci.fv.run()) {
          await safeInsert(ci.db, wlReview, {
            rev_type: 'P',
            poster_name: ci.input.post('poster_name'),
            email: ci.input.post('email'),
            rate: ci.input.post('rating'),
            entity_id: ci.input.post('prod_id'),
            member_id: userPostId,
            comment: ci.input.post('comment'),
            posted_date: ci.config('config.date.time'),
            status: '0',
          });
          data.success = 'true';
          data.message = 'Your review has been posted successfully.We will get back to you soon.';
        } else {
          data.success = 'false';
          data.error = firstErrorText(ci);
        }
      } else {
        data.success = 'false';
        data.error = 'Some parameter missing';
      }
    } else {
      data.success = 'false';
      data.error = 'Please login first!';
    }
  } else {
    data.success = 'false';
    data.error = 'parameter missing';
  }
  ci.out.json(data);
}

/** /api/products/product_enquiry — POST only: products_id, action=product_enquiry, first_name, email, mobile_number, message */
async function productEnquiry(req) {
  const { ci } = req;
  const data = {};
  if (ci.input.server('REQUEST_METHOD') !== 'POST') {
    data.success = 'false';
    data.error = 'Request method does not allow';
    ci.out.json(data);
    return;
  }
  const productId = intval(ci.input.getPost('products_id'));
  const res = await productModel.getProducts(ci, 1, 0, { productid: productId });
  if (!res) {
    data.success = 'false';
    data.error = 'Invalid Product Id';
    ci.out.json(data);
    return;
  }
  data.product_name = res.product_name;
  data.products_id = res.products_id;
  if (!eq(ci.input.getPost('action'), 'product_enquiry')) {
    data.success = 'false';
    data.error = 'Parameter Missing';
    ci.out.json(data);
    return;
  }
  ci.fv.setRules('first_name', 'Name', 'trim|alpha|required|max_length[40]');
  ci.fv.setRules('email', 'Email Id', 'trim|required|valid_email|max_length[100]');
  ci.fv.setRules('mobile_number', 'Contact Number', 'trim|required|max_length[25]');
  ci.fv.setRules('message', 'Enquiry/Comment', 'trim|required|max_length[8500]');
  if (!(await ci.fv.run())) {
    data.success = 'false';
    data.error = firstErrorText(ci, 1427);
    ci.out.json(data);
    return;
  }
  const lastName = neq(ci.input.post('last_name'), '') ? ci.input.post('last_name') : '';
  const productName = res.product_name;
  const message = ci.input.post('message');
  const mobile = ci.input.post('mobile_number');
  const email = ci.input.post('email');
  const name = ci.input.post('first_name');
  const posted = xssClean(
    {
      type: '2',
      product_service: productName,
      product_id: productId,
      first_name: name,
      last_name: lastName,
      email,
      mobile_number: mobile,
      phone_number: mobile,
      message,
      receive_date: ci.config('config.date.time'),
    },
    ci.requestUri,
  );
  await safeInsert(ci.db, wlEnquiry, posted);

  const content = await getContent(ci.db, 'wl_auto_respond_mails', '7');
  const admin = await ci.adminInfo();
  const adminEmail = admin ? admin.admin_email : null;
  const siteName = ci.config('site_name');
  const subject = strReplace('{site_name}', ci.config('-'), `${str(content ? content.email_subject : null)} ${str(siteName)}`);
  const template = content ? content.email_content : null;

  let body = strReplace('{mem_name}', name, template);
  body = strReplace('{name}', '', body);
  body = strReplace('{service_name}', productName, body);
  body = strReplace('{email}', email, body);
  body = strReplace('{mobile}', mobile, body);
  body = strReplace('{message}', nl2br(message), body);
  body = strReplace('{admin_email}', adminEmail, body);
  body = strReplace('{site_name}', siteName, body);
  body = strReplace('{url}', ci.baseUrl(), body);
  mailNotify({ subject, to_email: email, from_email: adminEmail, from_name: siteName, body_part: body });

  body = strReplace('{mem_name}', 'Admin', template);
  body = strReplace('{service_name}', productName, body);
  body = strReplace('{name}', `<tr><td width="10%"><strong>Name:</strong></td><td width="88%">${str(name)}</td></tr>`, body);
  body = strReplace('{email}', email, body);
  body = strReplace('{mobile}', mobile, body);
  body = strReplace('{message}', nl2br(message), body);
  body = strReplace('{admin_email}', adminEmail, body);
  body = strReplace('{site_name}', siteName, body);
  body = strReplace('{url}', ci.baseUrl(), body);
  mailNotify({ subject, to_email: adminEmail, from_email: email, from_name: name, body_part: body });

  data.message = 'Your enquiry has been sent successfully.We will get back to you soon.';
  data.success = 'true';
  ci.out.json(data);
}

/** /api/products/producer — $this->producer_model was never loaded (fatal Error). */
async function producer(req) {
  req.ci.out.fatalError('Call to a member function getProducer() on null', CONTROLLER_FILE, 1456);
}

/** /api/products/producers — $this->producer_model was never loaded (fatal Error). */
async function producers(req) {
  req.ci.out.fatalError('Call to a member function getProducer() on null', CONTROLLER_FILE, 1491);
}

/** /api/products/flyer */
async function flyer(req) {
  req.ci.out.json({
    res: {
      is_new: 'New',
      is_popular: 'Popular Product',
      is_choice: 'Choice Product',
      is_favorite: 'Favorite Product',
      is_recommadation: 'Recommadation Product',
    },
    success: 'true',
  });
}

const PRICE_RANGES = [
  ['0-99', 'Below 100'],
  ['100-500', '100 - 500'],
  ['501-1000', '501 - 1000'],
  ['1001-2000', '1001 - 2000'],
  ['2001-5000', '2001 - 5000'],
  ['5001-9999999', 'Above 5000'],
];

const asFilterItems = (rows, idKey, nameKey) => rows.map((r) => ({ id: r[idKey], name: r[nameKey], status: false }));

/** /api/products/search_attribute — categories, brands, price ranges, colors, sizes (keyword/status filter them) */
async function searchAttribute(req) {
  const { ci } = req;
  const { rows: categories } = await categoryModel.getCategory(ci, {
    field: 'a.category_id,category_name',
    condition: sql`AND parent_id = '0' AND status='1' `,
    order: 'sort_order ASC ',
  });
  const catRes = categories ? asFilterItems(categories, 'category_id', 'category_name') : [];
  const brands = await attributeModel.getActiveBrands(ci.db);
  // PHP tested the category result here ($res_array), not the brands.
  const brandRes = categories && brands.length ? asFilterItems(brands, 'brand_id', 'brand_name') : [];
  const priceRanges = PRICE_RANGES.map(([id, name]) => ({ id, name, status: false }));
  const colors = await attributeModel.getActiveColors(ci);
  const colorRes = colors ? asFilterItems(colors, 'color_id', 'color_name') : [];
  const sizes = await attributeModel.getActiveSizes(ci);
  const sizeRes = sizes ? asFilterItems(sizes, 'size_id', 'size_name') : [];
  ci.out.json({
    success: 'true',
    cat_res: catRes,
    brand_res: brandRes,
    price_ranges: priceRanges,
    color_res: colorRes,
    size_res: sizeRes,
  });
}

/** /api/products/color — keyword, status */
async function color(req) {
  const { ci } = req;
  const colors = await attributeModel.getActiveColors(ci);
  ci.out.json(colors ? { success: 'true', res: colors } : { success: 'false', error: ci.lang('no_record_found') });
}

/** /api/products/size — keyword, status */
async function size(req) {
  const { ci } = req;
  const sizes = await attributeModel.getActiveSizes(ci);
  ci.out.json(sizes ? { success: 'true', res: sizes } : { success: 'false', error: ci.lang('no_record_found') });
}

/** /api/products/brand */
async function brand(req) {
  const { ci } = req;
  const brands = await attributeModel.getActiveBrands(ci.db);
  const data = brands.length ? { success: 'true', res: brands } : { success: 'false', error: ci.lang('no_record_found') };
  data.product_image_path = `${ci.baseUrl()}uploaded_files/brand`;
  data.product_no_image_path = `${ci.baseUrl()}uploaded_files/products/noimg.png`;
  ci.out.json(data);
}

/**
 * /api/products/featured — get_products() received $this->language_id (undefined, NULL) as its field list, so
 * the SELECT starts "SQL_CALC_FOUND_ROWS, wlp.status ..." and MySQL always rejects it (database error page).
 */
async function featured(req) {
  const { ci } = req;
  let orderBy = toBool(ci.input.post('sort_by')) ? ci.input.post('sort_by') : 'wlp.product_name DESC ';
  orderBy = toBool(ci.input.post('sortbyprice')) ? ci.input.post('sortbyprice') : orderBy;
  await productModel.getProducts(ci, 5000, 0, { orderby: orderBy, customer_id: ci.userId, where: "wlp.status = '1' AND wlp.is_featured = '1'" }, null);
  // Not reached: MySQL rejects the query above (same as PHP).
  ci.out.json({ success: 'false', error: ci.lang('no_record_found') });
}

/** /api/products/home — the first get_products() call fails like in featured() (database error page). */
async function home(req) {
  const { ci } = req;
  await productModel.getProducts(ci, 10, 0, { where: "wlp.status = '1' AND wlp.is_recommadation = '1'", wish_user_id: ci.userId }, null);
  // Not reached: MySQL rejects the query above (same as PHP).
  ci.out.json({ success: 'true' });
}

/** /api/products/price_range */
async function priceRange(req) {
  req.ci.out.json({ success: 'true', res: Object.fromEntries(PRICE_RANGES) });
}

/** /api/products/get_size_price — size_id, product_id (color_id is ignored) */
async function getSizePrice(req) {
  const { ci } = req;
  const pSize = intval(ci.input.getPost('size_id'));
  const productsId = intval(ci.input.getPost('product_id'));
  let data;
  if (pSize > 0 && productsId > 0) {
    const priceRes = await getProductPrice(ci.db, sql`AND product_id=${str(productsId)} AND product_size=${str(pSize)} `);
    data = priceRes
      ? {
          success: 'true',
          product_price: priceRes.product_price,
          product_discounted_price: priceRes.product_discounted_price,
          product_quantity: priceRes.product_quantity,
          inventory: priceRes.inventory,
        }
      : { success: 'false', error: 'Invalid Credentials' };
  } else {
    data = { success: 'false', error: 'parameter missing' };
  }
  ci.out.json(data);
}

/** /api/products/certificate_authority — the model file does not exist (CI show_error). */
async function certificateAuthority(req) {
  req.ci.out.showError('Unable to locate the model you have specified: Certificate_authority_model');
}

module.exports = {
  index,
  suggestionSearch,
  productPaging,
  getSizePriceOld,
  detail,
  getViewStock,
  getProductReview,
  productReviewPost,
  productEnquiry,
  producer,
  producers,
  flyer,
  searchAttribute,
  color,
  size,
  brand,
  featured,
  priceRange,
  getSizePrice,
  home,
  certificateAuthority,
};
