/**
 * Product / category queries used by modules/api/controllers/Pages.php (banner_list, search_list):
 *  - Product_model::get_products()  (modules/products/models/Product_model.php)
 *  - Category_model::getcategory()  with limit/offset (modules/category/models/Category_model.php)
 *  - the per-product decoration loop Pages::banner_list() repeats for every product block.
 */
const fs = require('fs');
const path = require('path');
const { sql } = require('drizzle-orm');
const env = require('../config/env');
const { fetchAll, findAll, countRecord } = require('./common.model');
const { getProductPrice, productOverallRating } = require('./helper.model');
const { str, trim, intval, num, eq } = require('../utils/php');
const { applyFilter } = require('../utils/helpers');

/** Joins [{ type: 'AND'|'OR', cond: sql }] the way CodeIgniter compiles its qb_where array. */
function ciWhere(parts) {
  if (!parts.length) return sql``;
  const chunks = parts.map((p, i) => (i === 0 ? p.cond : sql` ${sql.raw(p.type)} ${p.cond}`));
  return sql` WHERE ${sql.join(chunks, sql``)}`;
}

/**
 * A request-supplied identifier used by PHP as a column name (CI protect_identifiers): always emitted as a
 * quoted identifier, so anything that is not a real column fails with "Unknown column" as it did in PHP.
 */
function quoteIdent(name) {
  return sql.raw(
    str(name)
      .split('.')
      .map((p) => `\`${p.trim().replace(/`/g, '``')}\``)
      .join('.'),
  );
}

/** CI order_by($orderby) with escaping: comma separated "field [ASC|DESC]" items. */
function ciOrderBy(orderby) {
  const items = str(orderby)
    .split(',')
    .map((field) => {
      const m = field.trimEnd().match(/\s+(ASC|DESC)$/i);
      const name = m ? field.slice(0, m.index).trimStart() : field.trim();
      const dir = m ? ` ${m[1]}` : '';
      // protect_identifiers() leaves expressions such as rand() untouched; only rand() is passed through as SQL
      // (any other request-supplied expression is quoted as an identifier and fails as an unknown column).
      const ident = /^rand\(\)$/i.test(name) ? sql.raw(name) : quoteIdent(name);
      return sql`${ident}${sql.raw(dir)}`;
    });
  return sql.join(items, sql`, `);
}

/**
 * Product_model::get_products($limit, $offset, $param, $fields = 'wlp.*').
 * param: { status, orderby, where (sql fragment), wish_user_id }.
 * Request input read by the model: keyword2, search_prod_type, sortby (get_post).
 * Returns the rows (array; empty array when nothing matched), or the first row / null when limit == '1'.
 */
async function getProducts(ci, limit = '10', offset = '0', param = {}, fields = 'wlp.*') {
  const wishUserId = intval(param.wish_user_id);
  const status = param.status;
  let orderby = param.orderby;
  const where = param.where;
  const keyword = trim(ci.input.getPost('keyword2', true));

  const parts = [];
  const and = (cond) => parts.push({ type: 'AND', cond });
  if (where !== undefined && where !== null && where !== '') and(where);
  if (str(status) !== '') and(sql`wlp.status = ${str(status)}`);

  const searchProdType = ci.input.getPost('search_prod_type', true);
  if (str(searchProdType) !== '') and(sql`${quoteIdent(`wlp.${str(searchProdType)}`)} = '1'`);

  if (keyword !== '') and(sql`(wlp.product_name LIKE ${`%${keyword}%`} OR wlp.product_code LIKE ${`%${keyword}%`} )`);

  const orders = [];
  const sortby = ci.input.getPost('sortby');
  if (str(sortby) !== '') orderby = sortby;
  if (str(orderby) !== '') {
    orderby = str(orderby);
    if (orderby === 'lth') orders.push(sql`price ASC`);
    if (orderby === 'htl') orders.push(sql`price DESC`);
    if (orderby === 'az') orders.push(sql`product_name ASC`);
    if (orderby === 'za') orders.push(sql`product_name DESC`);
  }
  if (!['lth', 'htl', 'az', 'za'].includes(str(orderby)) && str(orderby) !== '') orders.push(ciOrderBy(orderby));
  if (str(orderby) === '' || str(orderby) === '0') orders.push(sql`wlp.products_id DESC`);

  and(sql`wlp.status != '2'`);
  and(sql`wlstock.product_price > '0'`);

  const limitSql = str(limit) !== '' ? sql` LIMIT ${intval(offset)}, ${intval(limit)}` : sql``;
  const query = sql`SELECT SQL_CALC_FOUND_ROWS ${sql.raw(str(fields))},wlp.status as product_status,wlpm.media,wlpm.media_type,wlpm.is_default,(SELECT count(review_id) FROM wl_review WHERE entity_id=wlp.products_id AND rev_type = 'P' AND status = '1' ) AS review_count, IF(wlstock.product_discounted_price = 0,wlstock.product_price, wlstock.product_discounted_price ) as price, wlstock.product_price, wlstock.product_discounted_price, ( SELECT bnd.brand_name FROM wl_brands AS bnd WHERE wlp.brand_id=bnd.brand_id ) AS brand_name, IF(wlw.wishlists_id is null,0,1) as wishlist, wlw.wishlists_id FROM wl_products as wlp LEFT JOIN wl_products_media AS wlpm ON wlp.products_id=wlpm.products_id AND wlpm.type="main" INNER JOIN wl_product_stock AS wlstock ON wlp.products_id=wlstock.product_id LEFT JOIN wl_wishlists AS wlw ON wlp.products_id=wlw.product_id AND wlw.customer_id=${String(wishUserId)}${ciWhere(parts)} GROUP BY wlp.products_id${orders.length ? sql` ORDER BY ${sql.join(orders, sql`, `)}` : sql``}${limitSql}`;
  const rows = await fetchAll(ci.db, query);
  if (str(limit) === '1') return rows.length ? rows[0] : null;
  return rows;
}

/**
 * Category_model::getcategory($opts) with limit/offset support. Request input: keyword, status (get_post).
 * opts: { field, condition (sql fragment " AND ..."), order, limit, offset }. Returns rows or null.
 */
async function getCategoryList(ci, { field, condition, order, limit, offset } = {}) {
  const keyword = trim(ci.input.getPost('keyword', true));
  const status = ci.input.getPost('status', true);
  let where = sql`status !='2' ${condition}`;
  if (keyword !== '') where = sql`${where} AND category_name like ${`%${keyword}%`}`;
  if (str(status) !== '') where = sql`${where} AND status=${str(status)} `;
  const opts = { field, condition: where, order: order || 'sort_order ASC ' };
  if (limit !== undefined && num(applyFilter('NUMERIC_GT_ZERO', limit)) > 0) opts.limit = limit;
  if (offset !== undefined && applyFilter('NUMERIC_WT_ZERO', offset) !== -1) opts.start = offset;
  const { rows } = await findAll(ci.db, 'wl_categories as a', opts);
  return rows;
}

/** PHP 7 loose ordering comparison (<=>) for the scalar values these loops compare. */
function phpCmp(a, b) {
  const isNum = (v) => typeof v === 'number' || (typeof v === 'string' && /^[ \t\n\r\v\f]*[+-]?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?$/.test(v));
  if (a === null || a === undefined) a = typeof b === 'string' ? '' : false;
  if (b === null || b === undefined) b = typeof a === 'string' ? '' : false;
  if (typeof a === 'boolean' || typeof b === 'boolean') {
    const x = Boolean(a === '0' ? false : a);
    const y = Boolean(b === '0' ? false : b);
    return x === y ? 0 : x ? 1 : -1;
  }
  if (typeof a === 'string' && typeof b === 'string' && !(isNum(a) && isNum(b))) {
    const x = Buffer.from(a);
    const y = Buffer.from(b);
    const c = Buffer.compare(x, y);
    return c < 0 ? -1 : c > 0 ? 1 : 0;
  }
  const x = num(a);
  const y = num(b);
  return x === y ? 0 : x < y ? -1 : 1;
}

/** str_replace(NULL, '', $v): every scalar of the row becomes a string. */
function stringifyRow(v) {
  const out = {};
  for (const [k, val] of Object.entries(v)) out[k] = str(val);
  return out;
}

/**
 * The loop Pages::banner_list() runs over every product block: is_cart, first media, stock flags and
 * (for "Waiting For Review") the rounded-up overall rating.
 */
async function decorateProducts(ci, rows, { withRating = false } = {}) {
  const userId = ci.userId;
  const out = [];
  for (const v of rows) {
    let isCart = '0';
    if (num(userId) > 0) {
      const countCart = await countRecord(ci.db, 'tbl_temp_cart', sql`user_id = ${str(userId)} AND pid = ${str(v.products_id)} `);
      if (countCart > 0) isCart = '1';
    }
    v.is_cart = isCart;

    const med = await fetchAll(ci.db, sql`SELECT media FROM wl_products_media WHERE products_id=${str(v.products_id)} order by id asc LIMIT 1`);
    if (med.length > 0) {
      const media = med[0].media;
      v.media = str(media) !== '' && fs.existsSync(path.join(env.uploadDir, 'products', str(media))) ? media : '';
    }

    const priceRes = await getProductPrice(ci.db, sql`AND product_id=${str(v.products_id)}`);
    let lowStock = 0;
    let outOfStock = 0;
    let availableQuantity = 0;
    if (priceRes) {
      const qty = priceRes.product_quantity;
      lowStock = phpCmp(qty, priceRes.inventory) <= 0 && phpCmp(qty, 0) > 0 ? 1 : 0;
      outOfStock = eq(qty, 0) ? 1 : 0;
      availableQuantity = qty;
    }
    v.available_quantity = availableQuantity;
    v.low_stock = lowStock;
    v.out_of_stock = outOfStock;
    if (lowStock > 0) v.is_stock = '1';
    else if (outOfStock > 0) v.is_stock = '2';
    else v.is_stock = '0';

    if (withRating) {
      const rating = await productOverallRating(ci.db, v.products_id);
      v.overall_rating = Math.ceil(num(rating));
    }
    out.push(stringifyRow(v));
  }
  return out;
}

module.exports = { getProducts, getCategoryList, decorateProducts, ciWhere, phpCmp, stringifyRow };
