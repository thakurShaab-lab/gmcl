/**
 * Queries used by the checkout half of modules/api/controllers/Cart.php (delivery info, payment form,
 * order placement, invoices): temp cart tables, Members_model address books, Order_model and the raw
 * MY_Model::safe_insert/safe_update writes (CodeIgniter insert_string/update_string).
 */
const { sql } = require('drizzle-orm');
const { fetchAll, fetchRow, findAll, getDbFieldValue, getDbSingleRow, getAutoIncrement, safeInsert, safeUpdate } = require('./common.model');
const { str, intval, isNumeric, num } = require('../utils/php');

/* ----------------------------------------------------------------- temp cart */

/** SELECT *,(qty*price) AS <alias> FROM tbl_temp_cart WHERE user_id='<id>' (or app_id='<id>' when byApp). */
function cartRows(db, { userId, appId, byApp = false, alias = 'subtotal' }) {
  const where = byApp ? sql`app_id=${str(appId)}` : sql`user_id=${str(userId)}`;
  return fetchAll(db, sql`SELECT *,(qty*price) AS ${sql.raw(alias)} FROM tbl_temp_cart WHERE ${where} `);
}

/** SELECT * FROM tbl_temp_cart WHERE user_id='<id>' / app_id='<id>' (add_customer_order). */
function cartRowsPlain(db, { userId, appId, byApp = false }) {
  const where = byApp ? sql`app_id=${str(appId)}` : sql`user_id=${str(userId)}`;
  return fetchAll(db, sql`SELECT * FROM tbl_temp_cart WHERE ${where} `);
}

/**
 * Cart total row ($query->row_array()):
 *  byUser: SELECT sum((qty*price)) AS carttotal FROM tbl_temp_cart WHERE user_id='<id>' limit 1
 *  byApp:  ... WHERE app_id='<app>' [OR app_id='<app>'] GROUP BY app_id
 */
function cartTotal(db, { userId, appId, byApp = false, alias = 'carttotal', expr = '(qty*price)', doubleApp = false }) {
  if (!byApp) {
    return fetchRow(db, sql`SELECT sum(${sql.raw(expr)}) AS ${sql.raw(alias)} FROM tbl_temp_cart WHERE user_id=${str(userId)} limit 1 `);
  }
  const where = doubleApp ? sql`app_id=${str(appId)} OR app_id=${str(appId)}` : sql`app_id=${str(appId)}`;
  return fetchRow(db, sql`SELECT sum(${sql.raw(expr)}) AS ${sql.raw(alias)} FROM tbl_temp_cart WHERE ${where} GROUP BY app_id `);
}

/**
 * First row of tbl_temp_discountcoupon / tbl_temp_shipping:
 *  mode 'or':  WHERE user_id='<id>' OR app_id='<app>'
 *  mode 'and': WHERE user_id='<id>' AND app_id='<app>'
 *  mode 'app': WHERE app_id='<app>'
 */
function tempRow(db, table, mode, userId, appId) {
  const t = sql.raw(table === 'shipping' ? 'tbl_temp_shipping' : 'tbl_temp_discountcoupon');
  let where;
  if (mode === 'or') where = sql`user_id=${str(userId)} OR app_id =${str(appId)}`;
  else if (mode === 'and') where = sql`user_id=${str(userId)} AND app_id=${str(appId)}`;
  else where = sql`app_id=${str(appId)}`;
  return fetchRow(db, sql`SELECT * FROM ${t} WHERE ${where}`);
}

/** Deletes done by add_customer_order once the order is stored. */
async function clearTempCart(db, userId, appId) {
  const u = str(userId);
  const a = str(appId);
  if (userIdTruthy(userId)) {
    await db.execute(sql`DELETE FROM tbl_temp_cart WHERE user_id=${u} `);
    await db.execute(sql`DELETE FROM tbl_temp_discountcoupon WHERE user_id=${u} OR app_id=${a} `);
    await db.execute(sql`DELETE FROM tbl_temp_shipping WHERE user_id=${u} OR app_id=${a} `);
    await db.execute(sql`DELETE FROM tbl_temp_delivery_address WHERE user_id=${u} OR app_id=${a} `);
  } else {
    await db.execute(sql`DELETE FROM tbl_temp_discountcoupon WHERE app_id=${a}  `);
    await db.execute(sql`DELETE FROM tbl_temp_cart WHERE app_id=${a}`);
    await db.execute(sql`DELETE FROM tbl_temp_shipping WHERE app_id=${a}  `);
  }
  await db.execute(sql`DELETE FROM tbl_temp_delivery_address WHERE app_id=${a} `);
  await db.execute(sql`DELETE FROM tbl_temp_user WHERE app_id=${a}`);
}

const userIdTruthy = (v) => !(v === 0 || v === '0' || v === '' || v === null || v === undefined || v === false);

/* ------------------------------------------------------------ members model */

/** An integer interpolated unquoted by PHP after an (int) cast / from the token. */
const rawInt = (v) => sql.raw(String(intval(v)));

/** A value PHP interpolated unquoted without a cast (e.g. $added_by): digits only, otherwise empty (SQL error). */
function rawUnquoted(v) {
  const s = str(v);
  return sql.raw(/^-?\d+$/.test(s) ? s : isNumeric(s) ? String(Number(s)) : '');
}

/** Members_model::get_member_row($id): wl_customers row (array) or null. */
async function getMemberRow(db, id) {
  const n = intval(id);
  if (n === 0) return null; // PHP: 0 != '' is false
  const { rows } = await findAll(db, 'wl_customers', { field: '*', condition: sql`status !='2' AND customers_id=${rawInt(n)} `, start: 0, limit: 1 });
  return rows ? rows[0] : null;
}

/** Members_model::get_member_address_book($customer_id, $address_type, $address_id, $default_status) */
async function getMemberAddressBook(db, customerId, addressType = '', addressId = '', defaultStatus = '') {
  const id = intval(customerId);
  if (id === 0) return null;
  let cond = sql`customer_id =${rawInt(id)} `;
  if (str(defaultStatus) !== '') cond = sql`${cond} AND default_status =${str(defaultStatus)}`;
  if (str(addressType) !== '') cond = sql`${cond} AND address_type =${str(addressType)}`;
  if (num(addressId) > 0) cond = sql`${cond} AND address_id =${str(addressId)}`;
  return (await findAll(db, 'wl_customers_address_book', { field: '*', condition: cond })).rows;
}

/** Members_model::get_member_address_book_guest($customer_id, $address_type, $address_id, $default_status) */
async function getMemberAddressBookGuest(db, customerId, addressType = '', addressId = '', defaultStatus = '') {
  const id = intval(customerId);
  if (id === 0) return null;
  let cond = sql`user_id =${rawInt(id)} `;
  if (str(defaultStatus) !== '') cond = sql`${cond} AND is_default =${str(defaultStatus)}`;
  if (str(addressType) !== '') cond = sql`${cond} AND address_type =${str(addressType)}`;
  if (num(addressId) > 0) cond = sql`${cond} AND id =${str(addressId)}`;
  return (
    await findAll(db, 'tbl_temp_delivery_address', {
      field: 'tbl_temp_delivery_address.*,tbl_temp_delivery_address.user_id as customer_id,tbl_temp_delivery_address.id as address_id',
      condition: cond,
    })
  ).rows;
}

/**
 * Members_model::get_member_address_book_salseman($customer_id, $address_type, $address_id, $default_status, $added_by)
 * Written in the exact text CodeIgniter's query builder produced, because an empty $added_by (API-key requests)
 * makes MySQL report a syntax error quoting this SQL.
 */
async function getMemberAddressBookSalesman(db, customerId, addressType = '', addressId = '', defaultStatus = '', addedBy = '') {
  const id = intval(customerId);
  if (id === 0) return null;
  const t = 'tbl_temp_salesman_delivery_address';
  let cond = sql`\`user_id\` = ${rawInt(id)} AND \`added_by\` = ${rawUnquoted(addedBy)}`;
  if (str(defaultStatus) !== '') cond = sql`${cond} AND \`is_default\` = ${str(defaultStatus)}`;
  if (str(addressType) !== '') cond = sql`${cond} AND \`address_type\` = ${str(addressType)}`;
  if (num(addressId) > 0) cond = sql`${cond} AND \`id\` = ${str(addressId)}`;
  const rows = await fetchAll(
    db,
    sql`SELECT ${sql.raw(`\`${t}\`.*, \`${t}\`.\`user_id\` as \`customer_id\`, \`${t}\`.\`id\` as \`address_id\`
FROM \`${t}\`
WHERE `)}${cond}`,
  );
  return rows.length ? rows : null;
}

/* --------------------------------------------------------------- order model */

/** Order_model::get_order_master($ordId): wl_order row or null. */
async function getOrderMaster(db, ordId) {
  const id = intval(ordId);
  if (id === 0) return null;
  const { rows } = await findAll(db, 'wl_order', { field: '*', condition: sql`order_id =${rawInt(id)}`, start: 0, limit: 1 });
  return rows ? rows[0] : null;
}

/** Order_model::get_order_detail($ordno): wl_orders_products rows or null. */
async function getOrderDetail(db, ordNo) {
  return (await findAll(db, 'wl_orders_products', { field: '*', condition: sql`orders_id =${str(ordNo)}  ` })).rows;
}

/** Default product media of an ordered product (Cart::invoice). */
function productDefaultMedia(db, productId) {
  return fetchAll(
    db,
    sql` SELECT  wlpm.media FROM \`wl_products\` as \`wlp\` LEFT JOIN \`wl_products_media\` AS \`wlpm\` ON \`wlp\`.\`products_id\`=\`wlpm\`.\`products_id\` AND \`wlpm\`.\`is_default\` = 'Y' WHERE \`wlp\`.\`products_id\` = ${str(productId)} AND \`wlp\`.\`status\` != '2' GROUP BY \`wlp\`.\`products_id\` ORDER BY \`wlp\`.\`products_id\` DESC LIMIT 1 `,
  );
}

/** get_db_single_row('tbl_admin as ta, tbl_admin_lang as tal','*'," and ta.admin_id =1 and tal.language_id='<id>' ") */
function adminLangRow(ci, languageId) {
  return getDbSingleRow(ci.db, 'tbl_admin as ta, tbl_admin_lang as tal', '*', sql` and ta.admin_id =1 and tal.language_id=${str(languageId)} `, ci.out);
}

/** Stock decrement after a COD order (CodeIgniter query builder update on wl_product_stock). */
async function decrementStock(db, item) {
  let query = sql`UPDATE \`wl_product_stock\` SET product_quantity = product_quantity-${sql.raw(String(intval(item.quantity)))} WHERE \`product_id\` = ${str(item.products_id)}`;
  if (truthy(item.product_color_id)) query = sql`${query} AND \`product_color\` = ${str(item.product_color_id)}`;
  if (truthy(item.product_size_id)) query = sql`${query} AND \`product_size\` = ${str(item.product_size_id)}`;
  await db.execute(query);
}
const truthy = (v) => !(v === null || v === undefined || v === '' || v === '0' || v === 0 || v === false);

/** SELECT * FROM wl_orders_products WHERE orders_id='<id>' (stock update after a COD order). */
function orderProducts(db, orderId) {
  return fetchAll(db, sql`SELECT * FROM wl_orders_products WHERE orders_id=${str(orderId)}`);
}

/**
 * get_db_field_value('wl_orders_products','product_image',array('orders_products_id'=>$id)) as raw bytes
 * (empty Buffer when no row). Uses a prepared statement so the BLOB is not decoded as UTF-8.
 */
async function productImageBytes(db, ordersProductsId) {
  const [rows] = await db.$client.execute({
    sql: 'SELECT product_image FROM wl_orders_products WHERE 1 AND orders_products_id=?',
    values: [str(ordersProductsId)],
    typeCast: (field, next) => next(),
  });
  if (!rows.length || rows[0].product_image === null) return Buffer.alloc(0);
  const v = rows[0].product_image;
  return Buffer.isBuffer(v) ? v : Buffer.from(String(v), 'binary');
}

/* ------------------------------------------------------- raw MY_Model writes */

/**
 * MY_Model::safe_insert()/safe_update() — the shared writers (table names, CodeIgniter escaping, and MySQL
 * reporting unknown tables/columns exactly as PHP's database error page did).
 */
const rawInsert = safeInsert;
const rawUpdate = safeUpdate;

/* ------------------------------------------------------------------- misc */

const fieldValue = getDbFieldValue;

module.exports = {
  cartRows,
  cartRowsPlain,
  cartTotal,
  tempRow,
  clearTempCart,
  getMemberRow,
  getMemberAddressBook,
  getMemberAddressBookGuest,
  getMemberAddressBookSalesman,
  getOrderMaster,
  getOrderDetail,
  productDefaultMedia,
  adminLangRow,
  decrementStock,
  orderProducts,
  productImageBytes,
  rawInsert,
  rawUpdate,
  fieldValue,
  getDbSingleRow,
  getAutoIncrement,
  rawInt,
};
