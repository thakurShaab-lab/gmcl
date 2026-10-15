/**
 * modules/api/controllers/Cart.php — basket half: counters, cart items, wishlist, shipping, coupons, delivery
 * slots and the address book (every public method declared before add_deliveryinfo()).
 *
 * Cart::__construct sets $this->app_id = get_post('app_id') ?: ''. PHP comparison rules
 * (string vs number, null vs string) matter in many places here; see cmp()/plus().
 */
const { getImage } = require('../utils/thumbnail');
const crypto = require('crypto');
const { sql } = require('drizzle-orm');
const cartModel = require('../model/cart.model');
const memberModel = require('../model/cart.member.model');
const { fetchRow, getDbFieldValue, getDbSingleRow } = require('../model/common.model');
const { getProductPrice } = require('../model/helper.model');
const { applyFilter } = require('../utils/helpers');
const { str, num, intval, isNumeric, eq, neq, toBool, empty, numberFormat, phpDate, strtotime, time, urlTitle, PhpFloat } = require(
  '../utils/php',
);

const WARN_FILE = 'controllers/Cart.php';

/** A displayed warning raised inside a Cart method that CodeIgniter called directly (backtrace depth as PHP 5.6 shows it). */
function warn(ci, message, line) {
  ci.out.phpWarning(message, WARN_FILE, line, {
    frames: [null, null, { file: 'modules/api/controllers/Cart.php', line, fn: '_error_handler' }, null, null, { file: 'index.php', line: 304, fn: 'require_once' }],
  });
}
/** PHP 5.6 "Missing argument N for Cart::x()" warning(s) when a method is requested without its URL arguments. */
function missingArgument(ci, fn, line) {
  warn(ci, `Missing argument 1 for ${fn}()`, line);
}

/* ------------------------------------------------------------- PHP 5.6 semantics */

const norm = (v) => (v === undefined ? null : v instanceof PhpFloat ? v.valueOf() : v);
const sign = (n) => (n > 0 ? 1 : n < 0 ? -1 : 0);
const strcmp = (a, b) => sign(Buffer.compare(Buffer.from(a, 'utf8'), Buffer.from(b, 'utf8')));

/** PHP 5.6 loose ordering comparison ($a <=> $b) for scalars. */
function cmp(a, b) {
  a = norm(a);
  b = norm(b);
  if (a === null && typeof b === 'string') return strcmp('', b);
  if (b === null && typeof a === 'string') return strcmp(a, '');
  if (a === null || b === null || typeof a === 'boolean' || typeof b === 'boolean') {                       
    const x = toBool(a);
    const y = toBool(b);
    return x === y ? 0 : x ? 1 : -1;
  }
  if (typeof a === 'string' && typeof b === 'string') {
    if (isNumeric(a) && isNumeric(b)) return sign(Number(a) - Number(b));
    return strcmp(a, b);
  }
  return sign(num(a) - num(b));
}
const gt = (a, b) => cmp(a, b) > 0;
const lt = (a, b) => cmp(a, b) < 0;
const le = (a, b) => cmp(a, b) <= 0;
const ge = (a, b) => cmp(a, b) >= 0;

/** PHP 5.6 arithmetic "+" on scalars (no warnings for non-numeric strings in 5.6). */
const plus = (a, b) => num(a) + num(b);

/** $this->app_id */
const appIdProp = (ci) => {
  const v = ci.input.getPost('app_id');
  return toBool(v) ? v : '';
};
/** ($this->app_id>0) ? $this->app_id : get_post('app_id') */
const appIdOrPost = (ci) => {
  const v = appIdProp(ci);
  return gt(v, 0) ? v : ci.input.getPost('app_id');
};
/** CI random_string('numeric', 6): str_shuffle of "0123456789", first 6 characters. */
function randomNumeric6() {
  const pool = '0123456789'.split('');
  for (let i = pool.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, 6).join('');
}
/** str_replace(array("&nbsp;", "\n"), "", @$err_arr[0]) */
const cleanError = (msg) => str(msg).split('&nbsp;').join('').split('\n').join('');
/** SELECT * FROM tbl_temp_cart by user (user_id > 0) or by device: the number of rows. */
async function shoppingCount(ci) {
  const appId = appIdOrPost(ci);
  const userId = ci.userId;
  const rows = gt(userId, 0) ? await cartModel.cartRows(ci.db, { userId }) : await cartModel.cartRows(ci.db, { appId });
  return rows.length;
}

/* ------------------------------------------------------------------ counters */

/** /api/cart/shopping_count */
async function shoppingCountAction(req) {
  const { ci } = req;
  const userId = intval(ci.userId);
  let totalRows;
  let shopping;
  let wishTotal;
  if (userId > 0) {
    const rows = await cartModel.cartRows(ci.db, { userId });
    totalRows = await memberModel.unreadNotificationsFoundRows(ci, ci.userId);
    shopping = rows.length;
    wishTotal = await memberModel.wishlistFoundRows(ci, ci.userId);
  } else {
    totalRows = 0;
    shopping = 0;
    wishTotal = 0;
  }
  ci.out.json({ success: 'true', notification_count: totalRows, shopping_count: shopping, wish_count: wishTotal });
}

/** /api/cart/check_area — area. The locality tables do not exist in the database (MySQL error 1146). */
async function checkArea(req) {
  const { ci } = req;
  const data = {};
  const area = ci.input.getPost('area');
  if (toBool(area)) {
    // $this->language_id is never set (undefined property => '').
    const lower = str(area).replace(/[A-Z]+/g, (m) => m.toLowerCase());
    const row = await fetchRow(
      ci.db,
      sql`SELECT wl.city_id, wl.location_id, wll.title FROM wl_localities as wl INNER JOIN wl_localities_lang as wll ON wl.location_id=wll.location_id WHERE wl.status='1' and lower(wll.title)=${lower} and wll.language_id='' ORDER BY wll.title asc limit 0,1 `,
    );
    if (row) {
      row.city_name = await getDbFieldValue(ci.db, 'wl_cities_lang', 'title', { city_id: row.city_id, language_id: '' });
      data.locations = row;
      data.success = 'true';
    } else {
      data.locations = [];
      data.success = 'false';
      data.error = ci.lang('delivery_is_not_available_at_this_area');
    }
  } else {
    data.success = 'false';
    data.error = 'parameter missing';
  }
  ci.out.json(data);
}

/* ---------------------------------------------------------------- shipping */

/** Cart::shipping_apply(): applies the posted shipping method; returns $data (prints nothing). */
async function shippingApplyData(ci) {
  const appId = appIdOrPost(ci);
  const userId = ci.userId; // $this->user_id is undefined
  const appType = ci.input.getPost('app_type');
  let data = {};
  if (eq(ci.input.post('ship_apply'), 'apply')) {
    ci.fv.setRules('shipping_id', 'Shipping', 'trim');
    ci.fv.setRules('app_id', 'App id', 'trim');
    ci.fv.setRules('app_type', 'App Type', 'trim');
    if ((await ci.fv.run()) === true) {
      const shipId = ci.input.getPost('shipping_id');
      const shippingId = neq(shipId, '') ? shipId : '';
      let shippingRes = await cartModel.getShippingRate(ci.db, shippingId);
      shippingRes = shippingRes || {};
      if (toBool(userId)) await cartModel.deleteShippingUserOrApp(ci.db, userId, appId);
      else await cartModel.deleteShipping(ci.db, { appId });
      await cartModel.insertShipping(ci.db, {
        appId,
        appType,
        userId,
        shippingId,
        shippingType: shippingRes.shipping_type,
        shipmentRate: shippingRes.shipment_rate,
      });
      data.success = 'true';
      data.message = 'Thanks for choose shipping.';
    } else {
      data = { success: 'false', error: cleanError(ci.fv.firstError()) };
    }
  } else {
    data.success = 'false';
    data.error = 'Parameter missing.';
  }
  return data;
}

/** /api/cart/shipping_apply — returns its data to the caller; nothing is printed. */
async function shippingApply(req) {
  await shippingApplyData(req.ci);
}

/** Product_model::get_shipping_methods() (count(NULL) is 0 in PHP 5.6). */
function shippingMethods(ci) {
  return cartModel.getShippingMethods(ci.db);
}

/** /api/cart/shipping */
async function shipping(req) {
  const { ci } = req;
  const rows = await shippingMethods(ci);
  const data = {};
  if (rows && rows.length > 0) {
    data.success = 'true';
    data.shipping_res = rows;
  } else {
    data.success = 'false';
    data.error = 'No records found!';
  }
  ci.out.json(data);
}

/** /api/cart/cart_shipping — returns the methods; nothing is printed. */
async function cartShipping(req) {
  await shippingMethods(req.ci);
}

/* -------------------------------------------------------------- basket view */

/** /api/cart and /api/cart/index */
async function index(req) {
  const { ci } = req;
  await getDbFieldValue(ci.db, 'wl_currencies', 'code', { currency_id: '1' });
  const appId = ci.input.getPost('app_id');
  const userId = ci.userId;
  let data;

  if (eq(ci.input.post('ship_apply'), 'apply')) data = await shippingApplyData(ci);
  if (eq(ci.input.post('action'), 'coupon_apply')) {
    await couponApplyRun(ci);
    data = null;
  }
  if (!data) data = {};

  let couponRes;
  let shipRes;
  if (gt(userId, 0)) {
    couponRes = await cartModel.couponRow(ci.db, { userId, appId });
    shipRes = await cartModel.shippingRow(ci.db, { userId, appId });
  } else {
    couponRes = await cartModel.couponRow(ci.db, { appId });
    shipRes = await cartModel.shippingRow(ci.db, { appId });
  }
  let shippingAmount = '0';
  let shippingId = '';
  if (shipRes) {
    shippingAmount = shipRes.shipment_rate;
    shippingId = shipRes.shipping_id;
  }

  const cartRes = toBool(userId)
    ? await cartModel.cartRowsWithSubtotal(ci.db, { userId })
    : await cartModel.cartRowsWithSubtotal(ci.db, { appId });
  const totalRow = toBool(userId) ? await cartModel.cartTotalRow(ci.db, { userId }) : await cartModel.cartTotalRow(ci.db, { appId });
  let discountAmount = '0';
  data.cart_res = [];

  if (cartRes.length > 0 && gt(userId, 0)) {
    let cartTotal = totalRow ? totalRow.carttotal : null;
    data.cart_res = cartRes;
    data.cart_subtotal = cartTotal;
    data.shipping_id = shippingId;
    data.shipping_amount = shippingAmount;
    data.discount_amount = discountAmount;
    cartTotal = plus(cartTotal, shippingAmount);
    if (couponRes) {
      data.coupon_type = couponRes.coupon_type;
      discountAmount = couponRes.discount_amount;
      data.discount_amount = discountAmount;
      data.coupon_title = couponRes.coupon_type === 'Voucher' ? 'Cashback Amount' : 'Discount Amount';
    }
    data.success = 'true';
    const taxCent = '0';
    data.tax_cent = taxCent;
    const tax = (cartTotal * num(taxCent)) / 100;
    const finalAmount = cartTotal + tax - num(discountAmount);
    data.total_tax_cent = tax;
    data.final_cart_amount = numberFormat(finalAmount, 2);
    data.product_image_path = `${ci.baseUrl()}uploaded_files/products`;
    data.product_no_image_path = `${ci.baseUrl()}uploaded_files/products/noimg.png`;
  } else {
    data.success = 'false';
    data.error = 'Your Cart is empty.';
  }
  data.currency_code = await getDbFieldValue(ci.db, 'wl_currencies', 'code', { is_default: 'Y' });
  data.currency_symbol_left = await getDbFieldValue(ci.db, 'wl_currencies', 'symbol_left', { is_default: 'Y' });
  ci.out.json(data);
}

/* ---------------------------------------------------------- delivery slots */

/** Cart::get_delivery_date(): delivery dates with their time slots, from the admin settings. */
async function deliveryDates(ci) {
  const admin = (await ci.adminInfo()) || {};
  const field = (k) => (admin[k] === undefined ? null : admin[k]);
  const start = field('delivery_start_time');
  const end = field('delivery_end_time');
  const dur = field('delivery_time_slot_duration');
  const maxDays = field('maximum_days_allow');
  const perSlot = field('every_slot_maximum_order');

  const out = [];
  const now = time();
  let j = start;
  let c = 0;
  const dayLen = num(phpDate('d', now)) + num(maxDays);
  for (let d = phpDate('d', now); lt(d, dayLen); d = num(d) + 1) {
    const datetime = [];
    const date = phpDate('Y-m-d', strtotime(`+${c} day`));
    const datestr = strtotime(date);
    for (let i = start; lt(i, end); i = num(i) + 1) {
      const t = gt(num(j) + num(dur), end) ? end : num(j) + num(dur);
      const dateS = phpDate('Y-m-d H:i:s', strtotime(`+${str(j)} hour`, datestr));
      const dateE = phpDate('Y-m-d H:i:s', strtotime(`+${str(t)} hour`, datestr));
      if (!(now >= strtotime(dateS))) {
        const count = await cartModel.countPaidOrdersInSlot(ci.db, phpDate('Y-m-d H', strtotime(dateS)), phpDate('Y-m-d', strtotime(dateE)));
        datetime.push({
          time: `${lt(j, 12) ? `${str(j)}AM` : `${str(j)}PM`}-${lt(t, 12) ? `${str(t)}AM` : `${str(t)}PM`}`,
          delivery_status: le(count, perSlot) ? 'Y' : 'N',
        });
      }
      j = num(j) + num(dur);
      if (ge(j, end)) break;
    }
    j = start;
    if (datetime.length > 0) out.push({ date, times: datetime });
    c++;
  }
  return out;
}

/** /api/cart/get_delivery_date — returns the dates; nothing is printed. */
async function getDeliveryDate(req) {
  await deliveryDates(req.ci);
}

/** /api/cart/get_time_by_delivery_date — date */
async function getTimeByDeliveryDate(req) {
  const { ci } = req;
  const posted = ci.input.getPost('date');
  const dates = await deliveryDates(ci);
  let times = [];
  for (const d of dates) {
    if (eq(d.date, posted)) {
      times = d.times;
      break;
    }
  }
  const data = {};
  if (!empty(times)) {
    data.success = 'true';
    data.times = times;
  } else {
    data.success = 'false';
    data.error = ci.lang('no_record_found');
  }
  ci.out.json(data);
}

/** /api/cart/set_delivery — action=delivery, delivery_date, delivery_time (tbl_temp_delivery does not exist). */
async function setDelivery(req) {
  const { ci } = req;
  const appId = appIdOrPost(ci);
  const userId = ci.userId;
  const appType = ci.input.getPost('app_type');
  let data = {};
  if (eq(ci.input.post('action'), 'delivery')) {
    ci.fv.setRules('delivery_date', ci.lang('delivery_date'), 'trim|required');
    ci.fv.setRules('delivery_time', ci.lang('delivery_time'), 'trim|required');
    ci.fv.setRules('app_id', 'App id', 'trim');
    if ((await ci.fv.run()) === true) {
      await deliveryDates(ci);
      if (toBool(userId)) {
        await cartModel.deleteDelivery(ci.db, { userId });
        await cartModel.deleteDelivery(ci.db, { appId });
      } else {
        await cartModel.deleteDelivery(ci.db, { appId });
      }
      await cartModel.insertDelivery(ci.db, {
        appId,
        appType,
        userId,
        deliveryDate: ci.input.getPost('delivery_date'),
        deliveryTime: ci.input.getPost('delivery_time'),
      });
      data.success = 'true';
      data.message = ci.lang('delivery_selected');
    } else {
      data = { success: 'false', error: cleanError(ci.fv.firstError()) };
    }
  } else {
    data.success = 'false';
    data.error = 'Parameter missing.';
  }
  ci.out.json(data);
}

/* ------------------------------------------------------------- cart items */

/** /api/cart/remove_cart — RemoveCart=RemoveCart, id, app_id */
async function removeCart(req) {
  const { ci } = req;
  const data = {};
  if (eq(ci.input.getPost('RemoveCart'), 'RemoveCart')) {
    const appId = appIdProp(ci);
    const id = ci.input.getPost('id');
    const userId = ci.userId;
    if (toBool(userId)) {
      await cartModel.deleteCoupon(ci.db, { userId });
      await cartModel.deleteCart(ci.db, { userId }, id);
    } else {
      await cartModel.deleteCoupon(ci.db, { appId });
      await cartModel.deleteCart(ci.db, { appId }, id);
    }
    await cartModel.deleteCartItem(ci.db, id);
    data.success = 'true';
    data.shopping_count = (await cartModel.cartIdsByApp(ci.db, appId)).length;
    data.message = ci.config('cart_delete_item');
  } else {
    data.success = 'false';
    data.error = 'Parameter missing !';
  }
  data.shopping_count = await shoppingCount(ci);
  ci.out.json(data);
}

/** Cart::update_cart_qty(): "1" when the quantity exceeds the stock, "2" after updating, else null. */
async function updateCartQtyRun(ci) {
  const idParam = ci.input.getPost('id');
  const rowId = toBool(idParam) ? idParam : '';
  const appId = ci.input.getPost('app_id');
  const userId = ci.userId;
  const rows = gt(userId, 0) ? await cartModel.cartQtyRows(ci.db, { userId }) : await cartModel.cartQtyRows(ci.db, { appId });
  for (const item of rows) {
    if (neq(rowId, '') && neq(item.id, rowId)) continue;
    if (gt(ci.input.getPost('qty'), item.availableqty)) return '1';
    let qty = intval(ci.input.getPost('qty'));
    if (qty <= 0) qty = num(item.qty) + 1; // 'qty' was not selected: null + 1
    await cartModel.updateCartQty(ci.db, { id: item.id, availableqty: item.availableqty, qty }, rowId);
    return '2';
  }
  return null;
}

/** /api/cart/update_cart_qty — runs the update; nothing is printed. */
async function updateCartQty(req) {
  await updateCartQtyRun(req.ci);
}

/** /api/cart/update_quantity — Update_Qty, id, qty, app_id */
async function updateQuantity(req) {
  const { ci } = req;
  const data = {};
  if (neq(ci.input.getPost('Update_Qty'), '')) {
    const appId = ci.input.getPost('app_id');
    const userId = ci.userId;
    const rowId = ci.input.getPost('id');
    if (le(rowId, 0)) {
      data.success = 'false';
      data.error = 'Cart Id is required';
    } else {
      const availableqty = await getDbFieldValue(ci.db, 'tbl_temp_cart', 'availableqty', { id: rowId });
      if ((await updateCartQtyRun(ci)) === '1') {
        data.success = 'false';
        data.error = `Total available quantity of this product is only ${str(availableqty)} at the moment.`;
      } else {
        if (toBool(userId)) await cartModel.deleteCouponUserOrApp(ci.db, userId, appId);
        else await cartModel.deleteCoupon(ci.db, { appId });
        data.success = 'true';
        data.message = ci.config('cart_quantity_update');
      }
    }
  } else {
    data.success = 'false';
    data.error = 'Parameter missing !';
  }
  ci.out.json(data);
}

/** /api/cart/empty_cart — POST only; action=empty_cart, app_id */
async function emptyCart(req) {
  const { ci } = req;
  const data = {};
  if (ci.input.server('REQUEST_METHOD') === 'POST') {
    const appId = appIdOrPost(ci);
    if (eq(ci.input.post('action'), 'empty_cart') && neq(appId, '')) {
      const userId = ci.userId;
      if (gt(userId, 0)) {
        await cartModel.deleteCart(ci.db, { userId });
        await cartModel.deleteShipping(ci.db, { userId });
        await cartModel.deleteCoupon(ci.db, { userId });
      }
      await cartModel.deleteCart(ci.db, { appId });
      await cartModel.deleteShipping(ci.db, { appId });
      await cartModel.deleteCoupon(ci.db, { appId });
      data.success = 'true';
      data.message = 'your cart is empty !';
    } else {
      data.success = 'false';
      data.error = 'parameter missing';
    }
  } else {
    data.success = 'false';
    data.error = 'Request method does not allow';
  }
  ci.out.json(data);
}

/**
 * Cart::check_product_exits_into_cart($pres, $app_id): is the product (with the posted colour/size) in the cart?
 * `pres` is the product row; when it is a string (URL segment) PHP warned "Illegal string offset" and used its
 * first character.
 */
async function productInCart(ci, pres, appId = '') {
  const colorId = intval(ci.input.getPost('color_id'));
  const sizeId = intval(ci.input.getPost('size_id'));
  const userId = intval(ci.userId);
  const rows = userId > 0 ? await cartModel.cartItemKeys(ci.db, { userId }) : await cartModel.cartItemKeys(ci.db, { appId });
  let flag = false;
  for (const item of rows) {
    let pid;
    if (typeof pres === 'string') {
      warn(ci, "Illegal string offset 'products_id'", 759);
      pid = pres.charAt(0);
    } else pid = pres ? pres.products_id : null;
    if (eq(item.pid, pid)) {
      if (eq(item.color_id, colorId) && eq(item.size_id, sizeId)) {
        flag = true;
        break;
      } else flag = false;
    } else flag = false;
  }
  return flag;
}

/** /api/cart/check_product_exits_into_cart[/pres[/app_id]] — without arguments PHP 5.6 warns and runs with null. */
async function checkProductExitsIntoCart(req) {
  const { ci } = req;
  const pres = ci.segment(4);
  if (pres === null) missingArgument(ci, 'Cart::check_product_exits_into_cart', 736);
  const appId = ci.segment(5);
  await productInCart(ci, pres, appId === null ? '' : appId);
}

/** /api/cart/add_cart and /api/cart/add_to_cart — products_id, qty, size_id, color_id, app_id, app_type */
async function addCart(req) {
  const { ci } = req;
  const productId = ci.input.getPost('products_id');
  const appId = appIdOrPost(ci);
  const userId = ci.userId;
  let data = {};

  if (toBool(productId) && toBool(appId)) {
    if (!toBool(userId)) {
      data.success = 'false';
      data.error = 'Please login first';
    } else {
      const colors = await memberModel.productColors(ci.db, productId);
      const sizes = await memberModel.productSizes(ci.db, productId);
      if (Array.isArray(colors) && colors.length > 0) ci.fv.setRules('color_id', 'Color', 'trim|required');
      else ci.fv.setRules('color_id', 'Color', '');
      if (Array.isArray(sizes) && sizes.length > 0) ci.fv.setRules('size_id', 'Size', 'trim|required');
      else ci.fv.setRules('size_id', 'Size', 'trim');
      ci.fv.setRules('qty', 'Qty', 'trim|required|greater_than[0]');

      if ((await ci.fv.run()) === true) {
        const res = await memberModel.getProduct(ci, productId, userId);
        const r = res || {};
        const val = (k) => (r[k] === undefined ? null : r[k]);
        const postedQty = ci.input.getPost('qty');
        let qty = toBool(postedQty) ? postedQty : applyFilter('NUMERIC_GT_ZERO', 1);
        qty = gt(qty, 0) ? qty : 1;
        const inCart = await productInCart(ci, res, appId);
        const sizeId = intval(ci.input.getPost('size_id'));
        const colorId = intval(ci.input.getPost('color_id'));
        const priceRes =
          (await getProductPrice(
            ci.db,
            sql`AND product_id=${str(val('products_id'))} AND product_size=${String(sizeId)} AND product_color=${String(colorId)}`,
          )) || {};
        const pval = (k) => (priceRes[k] === undefined ? null : priceRes[k]);
        const availableQuantity = 100;
        const cartPrice = gt(pval('product_discounted_price'), 0) ? pval('product_discounted_price') : pval('product_price');

        if (inCart) {
          data.success = 'false';
          data.error = ci.config('cart_product_exist');
        } else if (le(cartPrice, 0)) {
          data.success = 'false';
          data.error = 'Product price is not available so you can not add product in your cart.';
        } else if (gt(qty, availableQuantity)) {
          data.success = 'false';
          data.error = `Total available quantity of this product is only ${availableQuantity} at the moment.`;
        } else {
          const availableqty = 100;
          const img2 = await getImage(ci, 'products', val('media'), '110', '110');
          let brandName = '';
          if (gt(val('brand_id'), 0)) brandName = await getDbFieldValue(ci.db, 'wl_brands', 'brand_name', { brand_id: val('brand_id') });
          let sizeName = '';
          if (sizeId > 0) sizeName = await getDbFieldValue(ci.db, 'wl_sizes', 'size_name', { size_id: sizeId });
          let colorName = '';
          let colorCode = '';
          if (colorId > 0) {
            const color = await getDbSingleRow(ci.db, 'wl_colors', 'color_name, color_code', { color_id: colorId }, ci.out);
            colorName = color ? color.color_name : null;
            colorCode = color ? color.color_code : null;
          }
          await cartModel.insertCart(ci.db, {
            id: randomNumeric6(),
            pid: val('products_id'),
            qty,
            availableqty,
            price: cartPrice,
            actual_price: pval('product_price'),
            discount_price: pval('product_discounted_price'),
            name: urlTitle(val('product_name')),
            origname: val('product_name'),
            img: val('media'),
            img2,
            code: val('product_code'),
            category_id: val('category_id'),
            brand_id: val('brand_id'),
            brand_name: brandName,
            user_id: userId,
            app_id: ci.input.getPost('app_id'),
            app_type: ci.input.getPost('app_type'),
            size_id: sizeId,
            size_name: sizeName,
            color_id: colorId,
            color_name: colorName,
            color_code: colorCode,
            add_date: ci.config('config.date'),
          });
          data.success = 'true';
          data.message = ci.config('cart_add');
        }
      } else {
        data = { success: 'false', error: cleanError(ci.fv.firstError()) };
      }
    }
  } else {
    data.success = 'false';
    data.error = 'Parameter missing  !';
  }
  data.shopping_count = await shoppingCount(ci);
  ci.out.json(data);
}

/** /api/cart/add_to_wishlist — products_id */
async function addToWishlist(req) {
  const { ci } = req;
  const userId = ci.userId;
  const productId = intval(ci.input.getPost('products_id'));
  const data = {};
  let wishTotal;
  if (!toBool(userId)) {
    data.success = 'false';
    data.error = 'Please login first';
    wishTotal = 0;
  } else {
    if ((await memberModel.countWishlist(ci.db, userId, productId)) > 0) {
      data.success = 'false';
      data.error = ci.config('wish_list_product_exists');
    } else {
      await memberModel.addWishlist(ci, productId, userId);
      data.success = 'true';
      data.message = ci.config('wish_list_add');
    }
    wishTotal = await memberModel.wishlistFoundRows(ci, userId);
    data.wishlists_id = await getDbFieldValue(ci.db, 'wl_wishlists', 'wishlists_id', { customer_id: userId, product_id: productId });
  }
  data.wish_count = wishTotal;
  ci.out.json(data);
}

/* ----------------------------------------------------------------- coupons */

/** Cart::apply_coupon_code($discount_res, '', $app_id): stores the discount in tbl_temp_discountcoupon. */
async function applyCouponCode(ci, discount, appId = '') {
  const userId = ci.userId;
  if (!discount || typeof discount !== 'object' || empty(discount)) return;
  const postedType = ci.input.post('app_type');
  const appType = toBool(postedType) ? postedType : 'android';
  let cartSum;
  let shipRes;
  if (gt(userId, 0)) {
    cartSum = await cartModel.cartTotalRow(ci.db, { userId }, 'total_price', 'price*qty');
    shipRes = await cartModel.shippingRowByUser(ci.db, userId);
  } else {
    cartSum = await cartModel.cartTotalRow(ci.db, { appId }, 'total_price', 'price*qty');
    shipRes = await cartModel.shippingRow(ci.db, { appId, appOnly: true });
  }
  const cartTotals = cartSum ? cartSum.total_price : null;
  const shipRate = shipRes ? shipRes.shipment_rate : null;
  const cartTotal = plus(cartTotals, shipRate);
  const type = discount.coupon_type;
  const by = toBool(userId) ? { userId } : { appId };
  const insert = (couponId, amount) =>
    cartModel.insertCoupon(ci.db, { appId, couponId, discountAmount: amount, couponType: type, appType, userId });

  if (intval(discount.minimum_order_amount) > 0) {
    if (neq(type, 'a')) {
      let amount = (cartTotal * num(discount.coupon_discount)) / 100;
      if (ge(cartTotal, discount.minimum_order_amount)) {
        if (ge(amount, discount.maximum_coupon_discount)) amount = discount.maximum_coupon_discount;
        await cartModel.deleteCoupon(ci.db, by);
        await insert(discount.coupon_id, amount);
      }
    } else {
      const amount = discount.coupon_discount;
      if (ge(cartTotal, amount) && ge(cartTotal, discount.minimum_order_amount)) {
        await cartModel.deleteCoupon(ci.db, by);
        await insert(discount.coupon_id, amount);
      }
    }
  } else if (neq(type, 'a')) {
    let amount = (cartTotal * num(discount.coupon_discount)) / 100;
    if (ge(cartTotal, amount)) {
      if (ge(amount, discount.maximum_coupon_discount)) amount = discount.maximum_coupon_discount;
      await cartModel.deleteCouponMisspelled(ci.db, by); // "bl_temp_discountcoupon": MySQL error 1146
      await insert(discount.id, amount);
    }
  } else {
    const amount = discount.coupon_discount;
    if (ge(cartTotal, amount)) {
      await cartModel.deleteCoupon(ci.db, gt(userId, 0) ? { userId } : { appId });
      await insert(undefined, amount); // $discount_res['id'] is undefined => ''
    }
  }
}

/** /api/cart/apply_coupon_code[/discount_res] — warns when the argument is missing; null/string does nothing. */
async function applyCouponCodeAction(req) {
  const { ci } = req;
  if (ci.segment(4) === null) missingArgument(ci, 'Cart::apply_coupon_code', 1175);
}

/** Cart::coupon_apply(): validates and applies a coupon; prints its JSON (index() calls it too). */
async function couponApplyRun(ci) {
  const appId = ci.appId;
  const userId = ci.userId;
  const customerType = ci.input.getPost('customer_type');
  let data = {};
  if (eq(ci.input.post('action'), 'coupon_apply')) {
    if (!toBool(userId)) {
      data.success = 'false';
      data.error = 'please login first.';
    } else {
      ci.fv.setRules('coupon_code', 'Coupon Code', 'trim|required');
      if (gt(customerType, 0)) ci.fv.setRules('member_id', 'Member Id', 'trim|required');
      if ((await ci.fv.run()) === true) {
        const memberId = gt(customerType, 0) ? ci.input.getPost('member_id') : userId;
        const code = ci.input.post('coupon_code');
        const cartRes = await cartModel.cartRowsWithSubtotal(ci.db, { userId });
        await cartModel.shippingRow(ci.db, { appId, appOnly: true });
        let totalRow = await cartModel.cartTotalRow(ci.db, { userId });
        const payamount = totalRow ? totalRow.carttotal : null;
        const discount = await cartModel.getDiscount(ci, code);
        if (discount) {
          const canUse = await cartModel.canUseCoupon(ci.db, discount.coupon_id, memberId, discount.coupon_usage, discount.coupon_for, discount.usage_count);
          if (eq(canUse, 0)) {
            data.success = 'false';
            data.error = 'Coupon could not be redeemed as it has reached maximum usage limit.';
          } else if (lt(payamount, discount.minimum_order_amount)) {
            data.success = 'false';
            data.error = `Sub total amount is not greater or equal to minimum order amount (${str(discount.minimum_order_amount)}). You can not use this coupon code.`;
          } else {
            data.success = 'true';
            await applyCouponCode(ci, discount, appId);
            const couponRes = await cartModel.couponRow(ci.db, { userId, userOnly: true });
            const shipRes = await cartModel.shippingRow(ci.db, { appId, appOnly: true });
            let shippingAmount = '';
            if (shipRes) shippingAmount = shipRes.shipment_rate;
            totalRow = await cartModel.cartTotalRow(ci.db, { userId });
            let discountAmount = '0';
            data.success = 'true';
            if (cartRes.length > 0) {
              let cartTotal = totalRow ? totalRow.carttotal : null;
              data.cart_subtotal = cartTotal;
              data.shipping_amount = shippingAmount;
              data.discount_amount = discountAmount;
              cartTotal = plus(cartTotal, shippingAmount);
              if (couponRes) {
                const p = couponRes.coupon_type === 'p' ? '%' : ' Amount';
                data.coupon_type = couponRes.coupon_type;
                data.coupon_p_a = str(discount.coupon_discount) + p;
                discountAmount = couponRes.discount_amount;
                data.discount_amount = discountAmount;
                cartTotal -= num(discountAmount);
                data.coupon_title = 'Discount Amount';
              }
              const taxCent = '0';
              data.tax_cent = taxCent;
              const tax = (cartTotal * num(taxCent)) / 100;
              data.total_tax_cent = tax;
              data.final_cart_amount = numberFormat(cartTotal + tax, 2, '.', '');
            }
            data.message = 'Coupon applied successfully.';
          }
        } else {
          data.success = 'false';
          data.error = 'Invalid coupon code.';
        }
      } else {
        data = { success: 'false', error: cleanError(ci.fv.firstError()) };
      }
    }
  } else {
    data.error = 'false';
    data.message = 'Parameter missing.';
  }
  ci.out.json(data);
}

/** /api/cart/coupon_apply — action=coupon_apply, coupon_code, customer_type, member_id */
async function couponApply(req) {
  await couponApplyRun(req.ci);
}

/** /api/cart/is_valid_coupon[/code[/category_id]] — a callback-style helper; prints nothing. */
async function isValidCoupon(req) {
  const { ci } = req;
  const code = ci.segment(4);
  await cartModel.getDiscount(ci, code === null ? '' : code);
}

/** /api/cart/valid_mobile[/field] — a form-validation callback; warns when the argument is missing, prints nothing. */
async function validMobile(req) {
  const { ci } = req;
  if (ci.segment(4) === null) missingArgument(ci, 'Cart::valid_mobile', 1317);
}

/* ------------------------------------------------------------ address book */

const isGuest = (ci) => eq(ci.loginType, '1');

/** Looks the address up for the current user: the id (string) or null. */
function ownAddressId(ci, addressId) {
  return isGuest(ci)
    ? getDbFieldValue(ci.db, 'tbl_temp_delivery_address', 'id', { user_id: ci.userId, id: addressId })
    : getDbFieldValue(ci.db, 'wl_customers_address_book', 'address_id', { customer_id: ci.userId, address_id: addressId });
}

/** /api/cart/set_default_address — address_id */
async function setDefaultAddress(req) {
  const { ci } = req;
  let addressId = intval(ci.input.post('address_id'));
  const data = {};
  if (addressId <= 0) {
    data.success = 'false';
    data.error = 'Address Id is not valid';
  } else {
    addressId = await ownAddressId(ci, addressId);
    if (le(addressId, 0)) {
      data.success = 'false';
      data.error = 'Address Id is not valid';
    } else {
      await memberModel.setDefaultAddress(ci.db, isGuest(ci), ci.userId, addressId);
      data.success = 'true';
      data.message = 'Set Default Address updated successfully.';
    }
  }
  ci.out.json(data);
}

/** /api/cart/delete_address — action=delete_address, address_id */
async function deleteAddress(req) {
  const { ci } = req;
  const data = {};
  if (eq(ci.input.post('action'), 'delete_address')) {
    let addressId = intval(ci.input.post('address_id'));
    if (addressId <= 0) {
      data.success = 'false';
      data.error = 'Address Id is not valid';
    } else {
      addressId = await ownAddressId(ci, addressId);
      // NULL >= 0 is true in PHP: an unknown id still "deletes" (WHERE id IS NULL).
      await memberModel.deleteAddress(ci.db, isGuest(ci), addressId);
      data.success = 'true';
      data.message = 'Address has been deleted';
    }
  } else {
    data.success = 'false';
    data.error = 'parameter missing';
  }
  ci.out.json(data);
}

/** /api/cart/addresses */
async function addresses(req) {
  const { ci } = req;
  const rows = isGuest(ci)
    ? await memberModel.memberAddressBookGuest(ci.db, ci.userId, 'Ship')
    : await memberModel.memberAddressBook(ci.db, ci.userId, 'Ship');
  const data = {};
  if (rows && rows.length > 0) {
    data.res = rows;
    data.success = 'true';
  } else {
    data.success = 'false';
    data.error = ci.lang('no_record_found');
  }
  ci.out.json(data);
}

/** Cart::__form_address_rules() */
async function addressRules(ci) {
  ci.callbacks.valid_mobile = (field) => {
    if (neq(field, '')) {
      ci.fv.setMessage('valid_mobile', `%s ${str(ci.lang('may_only_contain_number'))}`);
      return /^([0-9,\-+])+$/i.test(str(field));
    }
    return null;
  };
  ci.fv.setRules('first_name', 'First Name', 'trim|required|min_length[2]|max_length[50]');
  ci.fv.setRules('last_name', 'Last Name', 'trim|max_length[30]');
  ci.fv.setRules('mobile_number', 'Mobile Number', 'trim|required|max_length[15]|callback_valid_mobile[mobile_number]');
  ci.fv.setRules('address', 'Address', 'trim|max_length[250]');
  ci.fv.setRules('state', 'State', 'trim|required|max_length[50]');
  ci.fv.setRules('city', 'City', 'trim|required|max_length[250]');
  ci.fv.setRules('location', 'Location', 'trim|required|max_length[250]');
  ci.fv.setRules('zipcode', 'Pin Code', 'trim|required|integer|max_length[10]');
  return ci.fv.run();
}

/** /api/cart/add_address — action=add_address + address fields */
async function addAddress(req) {
  const { ci } = req;
  const data = {};
  if (eq(ci.input.post('action'), 'add_address')) {
    if ((await addressRules(ci)) === true) {
      const a = {
        reciv_date: ci.config('config.date.time'),
        address_type: 'Ship',
        first_name: ci.input.post('first_name', true),
        last_name: ci.input.post('last_name', true),
        address: ci.input.post('address', true),
        phone: ci.input.post('mobile_number', true),
        mobile: ci.input.post('mobile_number', true),
        city: ci.input.post('city', true),
        state: ci.input.post('state', true),
        country: 'India',
        zipcode: ci.input.post('zipcode'),
        location: ci.input.post('location'),
      };
      const guest = isGuest(ci);
      const defaultStatus = (await memberModel.countDefaultAddresses(ci.db, guest, ci.userId)) > 0 ? 'N' : 'Y';
      if (guest) {
        a.user_id = ci.userId;
        a.default_status = defaultStatus;
      } else {
        a.default_status = defaultStatus;
        a.customer_id = ci.userId;
      }
      const addressId = await memberModel.insertAddress(ci.db, guest, a);
      data.success = 'true';
      data.message = ci.lang('shiping_address_add');
      data.address_id = addressId;
    } else {
      data.success = 'false';
      data.error = cleanError(ci.fv.firstError());
    }
  } else {
    data.success = 'false';
    data.error = 'parameter missing';
  }
  ci.out.json(data);
}

/** /api/cart/edit_address — action=edit_address, address_id + address fields; echoes the stored address. */
async function editAddress(req) {
  const { ci } = req;
  const userId = ci.userId;
  const data = {};
  let addressId = intval(ci.input.post('address_id'));
  const guest = isGuest(ci);

  if (eq(ci.input.post('action'), 'edit_address')) {
    if (addressId <= 0) {
      data.success = 'false';
      data.error = 'Address Id is not valid';
    } else {
      addressId = await ownAddressId(ci, addressId);
      // NULL >= 0 is true in PHP, so the update runs (and matches nothing) for an unknown id.
      if ((await addressRules(ci)) === true) {
        const a = {
          first_name: ci.input.post('first_name', true),
          last_name: ci.input.post('last_name', true),
          address: ci.input.post('address', true),
          phone: ci.input.post('mobile_number', true),
          mobile: ci.input.post('mobile_number', true),
          city: ci.input.post('city', true),
          location: ci.input.post('location', true),
          state: ci.input.post('state', true),
          country: 'India',
          zipcode: ci.input.post('zipcode', true),
        };
        a.default_status = (await memberModel.countDefaultAddresses(ci.db, guest, userId)) > 0 ? 'N' : 'Y';
        await memberModel.updateAddress(ci.db, guest, a, userId, addressId);
        ci.input.post('area', true); // read for the (unused) billing array
        data.success = 'true';
        data.message = ci.lang('shiping_address_update');
      } else {
        data.success = 'false';
        data.error = cleanError(ci.fv.firstError());
      }
    }
  } else {
    data.success = 'false';
    data.error = 'parameter missing';
  }

  const row = guest
    ? await getDbSingleRow(ci.db, 'tbl_temp_delivery_address', '*', { user_id: userId, address_type: 'Ship', id: addressId }, ci.out)
    : await getDbSingleRow(ci.db, 'wl_customers_address_book', '*', { customer_id: userId, address_type: 'Ship', address_id: addressId }, ci.out);
  if (row) data.address_res = row;
  else data.error = 'no address added as yet.';
  ci.out.json(data);
}

module.exports = {
  shoppingCount: shoppingCountAction,
  checkArea,
  index,
  getTimeByDeliveryDate,
  getDeliveryDate,
  removeCart,
  updateQuantity,
  updateCartQty,
  addCart,
  emptyCart,
  checkProductExitsIntoCart,
  addToWishlist,
  setDelivery,
  shippingApply,
  shipping,
  cartShipping,
  couponApply,
  applyCouponCode: applyCouponCodeAction,
  isValidCoupon,
  validMobile,
  setDefaultAddress,
  deleteAddress,
  addresses,
  addAddress,
  editAddress,
};
