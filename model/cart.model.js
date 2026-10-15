/**
 * Temp-cart / shipping / coupon queries used by modules/api/controllers/Cart.php (basket half), plus the
 * Cart_model methods they call (modules/cart/models/Cart_model.php).
 *
 * The PHP code addressed the temp tables either by user (`user_id='<id>'`) or by device (`app_id='<id>'`);
 * `by` is { userId } or { appId } accordingly. Values are passed as strings, as PHP quoted them.
 */
const { sql } = require('drizzle-orm');
const { fetchAll, fetchRow, findAll, safeInsert, safeUpdate } = require('./common.model');
const { tblTempCart } = require('../schema');
const { str, intval, num, isNumeric } = require('../utils/php');

const byCond = (by) => (by.userId !== undefined ? sql`user_id=${str(by.userId)}` : sql`app_id=${str(by.appId)}`);

/* ------------------------------------------------------------ tbl_temp_cart */

/** SELECT * FROM tbl_temp_cart WHERE user_id='..' | app_id='..' */
function cartRows(db, by) {
  return fetchAll(db, sql`SELECT * FROM tbl_temp_cart WHERE ${byCond(by)} `);
}

/** SELECT *,(qty*price) AS subtotal FROM tbl_temp_cart WHERE ... */
function cartRowsWithSubtotal(db, by) {
  return fetchAll(db, sql`SELECT *,(qty*price) AS subtotal FROM tbl_temp_cart WHERE 1 AND ${byCond(by)} `);
}

/**
 * Cart total row: by user "SELECT sum((qty*price)) AS <alias> ... LIMIT 1" (always one row), by device
 * "... GROUP BY app_id" (no row when the device has no cart). Returns the row or null.
 */
function cartTotalRow(db, by, aliasName = 'carttotal', expr = '(qty*price)') {
  const head = sql`SELECT sum(${sql.raw(expr)}) AS ${sql.raw(aliasName)} FROM tbl_temp_cart WHERE 1 AND `;
  return by.userId !== undefined
    ? fetchRow(db, sql`${head}user_id=${str(by.userId)} limit 1 `)
    : fetchRow(db, sql`${head}app_id=${str(by.appId)} GROUP BY app_id `);
}

/** SELECT id,availableqty FROM tbl_temp_cart WHERE 1 AND ... */
function cartQtyRows(db, by) {
  return fetchAll(db, sql`SELECT id,availableqty FROM tbl_temp_cart WHERE 1 AND ${byCond(by)}`);
}

/** SELECT id,pid,size_id,color_id FROM tbl_temp_cart WHERE 1 AND ... */
function cartItemKeys(db, by) {
  return fetchAll(db, sql`SELECT id,pid,size_id,color_id FROM tbl_temp_cart WHERE 1 AND ${byCond(by)}`);
}

/** SELECT id FROM tbl_temp_cart WHERE 1 AND app_id ='..' */
function cartIdsByApp(db, appId) {
  return fetchAll(db, sql`SELECT id FROM tbl_temp_cart WHERE 1 AND app_id =${str(appId)}`);
}

/** DELETE FROM tbl_temp_cart WHERE 1 AND <by> [AND id='..'] */
function deleteCart(db, by, id) {
  const idCond = id === undefined ? sql`` : sql` AND id=${str(id)}`;
  return db.execute(sql`DELETE FROM tbl_temp_cart WHERE 1 AND ${byCond(by)}${idCond}`);
}

/** DELETE FROM tbl_temp_cart WHERE 1 AND id='..' */
function deleteCartItem(db, id) {
  return db.execute(sql`DELETE FROM tbl_temp_cart WHERE 1 AND id=${str(id)}`);
}

/** safe_update('tbl_temp_cart', {id, availableqty, qty}, " id ='<rowid>'") */
function updateCartQty(db, data, rowId) {
  return safeUpdate(db, tblTempCart, data, sql` id =${str(rowId)}`);
}

/** safe_insert('tbl_temp_cart', $cart_data) */
function insertCart(db, data) {
  return safeInsert(db, tblTempCart, data);
}

/* -------------------------------------------------------- tbl_temp_shipping */

/** First tbl_temp_shipping row: user → "user_id='..' OR app_id='..'", device → "app_id='..'"; or by app only. */
function shippingRow(db, { userId, appId, appOnly = false }) {
  if (appOnly) return fetchRow(db, sql`SELECT * FROM tbl_temp_shipping WHERE 1 AND app_id=${str(appId)}`);
  if (userId !== undefined) return fetchRow(db, sql`SELECT * FROM tbl_temp_shipping WHERE user_id=${str(userId)} OR app_id=${str(appId)}`);
  return fetchRow(db, sql`SELECT * FROM tbl_temp_shipping WHERE app_id=${str(appId)}`);
}

/** SELECT * FROM tbl_temp_shipping WHERE 1 AND user_id='..' (apply_coupon_code) */
function shippingRowByUser(db, userId) {
  return fetchRow(db, sql`SELECT * FROM tbl_temp_shipping WHERE 1 AND user_id=${str(userId)}`);
}

/** DELETE FROM tbl_temp_shipping WHERE user_id='..' OR app_id='..' | WHERE app_id='..' */
function deleteShippingUserOrApp(db, userId, appId) {
  return db.execute(sql`DELETE FROM tbl_temp_shipping WHERE user_id=${str(userId)} OR app_id=${str(appId)} `);
}
function deleteShipping(db, by) {
  return db.execute(sql`DELETE FROM tbl_temp_shipping WHERE ${byCond(by)}`);
}

/** INSERT INTO tbl_temp_shipping SET ... (all values quoted strings, like PHP) */
function insertShipping(db, v) {
  return db.execute(
    sql`INSERT INTO tbl_temp_shipping SET app_id=${str(v.appId)},app_type=${str(v.appType)},user_id=${str(v.userId)},shipping_id=${str(v.shippingId)},shipping_type=${str(v.shippingType)},shipment_rate=${str(v.shipmentRate)}`,
  );
}

/* --------------------------------------------------- tbl_temp_discountcoupon */

/** First coupon row: user → "user_id='..' OR app_id='..'", device → "app_id='..'"; or by user only. */
function couponRow(db, { userId, appId, userOnly = false }) {
  if (userOnly) return fetchRow(db, sql`SELECT * FROM tbl_temp_discountcoupon WHERE 1 AND user_id=${str(userId)}`);
  if (userId !== undefined) return fetchRow(db, sql`SELECT * FROM tbl_temp_discountcoupon WHERE user_id=${str(userId)} OR app_id=${str(appId)} `);
  return fetchRow(db, sql`SELECT * FROM tbl_temp_discountcoupon WHERE 1 AND app_id=${str(appId)}`);
}

/** DELETE FROM tbl_temp_discountcoupon WHERE <by> */
function deleteCoupon(db, by) {
  return db.execute(sql`DELETE FROM tbl_temp_discountcoupon WHERE 1 AND ${byCond(by)}`);
}

/** DELETE FROM tbl_temp_discountcoupon WHERE 1 AND user_id='..' OR app_id='..' (update_quantity) */
function deleteCouponUserOrApp(db, userId, appId) {
  return db.execute(sql`DELETE FROM tbl_temp_discountcoupon WHERE 1 AND user_id=${str(userId)} OR app_id=${str(appId)} `);
}

/**
 * apply_coupon_code() with minimum_order_amount = 0 deleted from the misspelled table "bl_temp_discountcoupon",
 * which does not exist: MySQL error 1146 (CodeIgniter database error page). Reproduced as is.
 */
function deleteCouponMisspelled(db, by) {
  return db.execute(sql`DELETE from bl_temp_discountcoupon WHERE 1 AND ${byCond(by)} `);
}

/** INSERT INTO tbl_temp_discountcoupon SET ... */
function insertCoupon(db, v) {
  return db.execute(
    sql`INSERT INTO tbl_temp_discountcoupon SET app_id=${str(v.appId)},coupon_id=${str(v.couponId)},discount_amount=${str(v.discountAmount)},coupon_type=${str(v.couponType)},app_type=${str(v.appType)},user_id=${str(v.userId)}`,
  );
}

/* --------------------------------------------------------- tbl_temp_delivery */

/** set_delivery(): the table does not exist in the database — these fail with MySQL error 1146, like PHP. */
function deleteDelivery(db, by) {
  return db.execute(sql`DELETE FROM tbl_temp_delivery WHERE ${byCond(by)} `);
}
function insertDelivery(db, v) {
  return db.execute(
    sql`INSERT INTO tbl_temp_delivery SET app_id=${str(v.appId)},app_type=${str(v.appType)},user_id=${str(v.userId)},delivery_date=${str(v.deliveryDate)},delivery_time=${str(v.deliveryTime)}`,
  );
}

/** get_delivery_date(): $this->db->from('wl_order')->where($conditions)->count_all_results() */
async function countPaidOrdersInSlot(db, from, to) {
  const row = await fetchRow(
    db,
    sql`SELECT COUNT(*) AS numrows FROM wl_order WHERE DATE_FORMAT('delivery_date', '%Y-%m-%d %H') >=${from} AND DATE_FORMAT('delivery_date', '%Y-%m-%d %H') <=${to} AND payment_status= 'Paid'`,
  );
  return row ? intval(row.numrows) : 0;
}

/* --------------------------------------------------------------- Cart_model */

/** MY_Model::find($tbl, {condition}) — first row of findAll(start 0, limit 1) or null. */
async function find(db, table, condition) {
  const { rows } = await findAll(db, table, { condition, start: 0, limit: 1 });
  return rows ? rows[0] : null;
}

/** MY_Model::findCount($tbl, $conditions) */
async function findCount(db, table, condition) {
  const row = await fetchRow(db, sql`SELECT COUNT(*) AS numrows FROM ${sql.raw(table)} WHERE ${condition}`);
  return intval(row.numrows);
}

/** Cart_model::get_discount($code): active coupon valid today, or null. */
function getDiscount(ci, code) {
  if (code === null || code === undefined || code === '' || code === false) return null;
  const today = ci.config('config.date');
  return find(
    ci.db,
    'wl_coupons',
    sql`status ='1' AND coupon_code = ${str(code)} AND start_date  <= ${today} AND end_date  >= ${today} `,
  );
}

/** Cart_model::get_shipping_rate($shipId) */
function getShippingRate(db, shipId) {
  const id = intval(shipId);
  if (id === 0) return null; // PHP 7: 0 != '' is false
  return find(db, 'wl_shipping', sql`status ='1' AND shipping_id =${String(id)}`);
}

/** Cart_model::can_use_coupon(): number of uses left (>0) or the string '0'. */
async function canUseCoupon(db, couponId, userId, couponUsage = 'single', couponFor = '0', usageCount = '1') {
  let n;
  const forMembers = isNumeric(str(couponFor)) ? num(couponFor) === 1 : str(couponFor) === '1';
  const memberCount = () =>
    findCount(db, 'wl_coupon_customers', sql`coupon_id = ${str(couponId)} AND customer_id = ${str(userId)} AND status = '0'`);
  const orderCount = () => findCount(db, 'wl_order', sql`discount_coupon_id = ${str(couponId)} AND customers_id = ${str(userId)}`);
  if (str(couponUsage) === 'single') {
    if (forMembers) n = await memberCount();
    else n = (await orderCount()) > 0 ? 0 : 1;
  } else if (forMembers) n = await memberCount();
  else n = (await orderCount()) >= num(usageCount) ? 0 : 1;
  return n > 0 ? n : '0';
}

/** Product_model::get_shipping_methods(): active shipping rows (newest first) or null. */
async function getShippingMethods(db) {
  const { rows } = await findAll(db, 'wl_shipping', { condition: sql`status =1`, order: 'shipping_id DESC' });
  return rows;
}

module.exports = {
  cartRows,
  cartRowsWithSubtotal,
  cartTotalRow,
  cartQtyRows,
  cartItemKeys,
  cartIdsByApp,
  deleteCart,
  deleteCartItem,
  updateCartQty,
  insertCart,
  shippingRow,
  shippingRowByUser,
  deleteShippingUserOrApp,
  deleteShipping,
  insertShipping,
  couponRow,
  deleteCoupon,
  deleteCouponUserOrApp,
  deleteCouponMisspelled,
  insertCoupon,
  deleteDelivery,
  insertDelivery,
  countPaidOrdersInSlot,
  find,
  findCount,
  getDiscount,
  getShippingRate,
  canUseCoupon,
  getShippingMethods,
};
