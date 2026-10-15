/**
 * Queries used by modules/api/controllers/Member.php:
 *   modules/members/models/Members_model.php, modules/users/models/Users_model.php (is_email_exits),
 *   modules/products/models/Product_model.php (get_reviews), modules/coupons/models/Coupons_model.php
 *   (get_discount_coupon) and the raw queries the controller ran itself.
 *
 * Several tables/columns referenced by the PHP code do not exist in the database (wl_device_registration,
 * wl_referral_customers, wl_reasons_lang, tbl_admin_lang, address-book columns such as longitude/area,
 * wl_customers.is_face_authentication ...). Writes are therefore built as plain SQL from the column names
 * written in code (values are always parameters), so MySQL raises exactly the error PHP got.
 */
const fs = require('fs');
const path = require('path');
const { sql } = require('drizzle-orm');
const env = require('../config/env');
const { fetchAll, fetchRow, findAll, getFoundRows } = require('./common.model');
// Order_model::get_order_master()/get_order_detail() are shared with the Cart checkout (order.model.js).
const { getOrderMaster, getOrderDetail } = require('./order.model');
const { str, trim, eq } = require('../utils/php');

/* ------------------------------------------------------------------ generic writers */

const ident = (name) => sql.raw(`\`${name}\``);

/** CI escape(): strings quoted, numbers raw, null -> NULL, booleans -> 1/0. */
const val = (v) => (v === undefined ? null : typeof v === 'boolean' ? (v ? 1 : 0) : Array.isArray(v) ? 'Array' : v);

/** MY_Model::safe_insert($table, $data) — returns the insert id. */
async function insertRow(db, table, data) {
  const cols = Object.keys(data);
  if (!cols.length) return null;
  const [res] = await db.execute(
    sql`INSERT INTO ${ident(table)} (${sql.join(cols.map(ident), sql`, `)}) VALUES (${sql.join(
      cols.map((c) => sql`${val(data[c])}`),
      sql`, `,
    )})`,
  );
  return res.insertId;
}

/** MY_Model::safe_update($table, $data, $where) — `where` is an sql fragment. */
async function updateRows(db, table, data, where) {
  const cols = Object.keys(data);
  if (!cols.length) return undefined;
  const [res] = await db.execute(
    sql`UPDATE ${ident(table)} SET ${sql.join(
      cols.map((c) => sql`${ident(c)} = ${val(data[c])}`),
      sql`, `,
    )}
WHERE ${where}`,
  );
  return res;
}

/** MY_Model::safe_delete($table, array(col => v)) — CI where(): NULL values become "col IS NULL". */
async function deleteRows(db, table, where) {
  const parts = Object.entries(where).map(([c, v]) => (v === null || v === undefined ? sql`${ident(c)} IS NULL` : sql`${ident(c)} = ${val(v)}`));
  const [res] = await db.execute(sql`DELETE FROM ${ident(table)} WHERE ${sql.join(parts, sql` AND `)}`);
  return res;
}

/**
 * get_db_field_value($table, $field, $condition) where the table may not exist (raw SQL): `where` is an
 * array-style object (" AND col='v'") or an sql fragment appended after "WHERE 1".
 */
async function dbFieldValue(db, table, field, where) {
  const cond = typeof where.getSQL === 'function' ? where : sql.join(Object.entries(where).map(([c, v]) => sql` AND ${sql.raw(c)}=${str(v)}`), sql``);
  const row = await fetchRow(db, sql`SELECT ${sql.raw(field)} FROM ${sql.raw(table)} WHERE 1${cond}`);
  if (!row) return null;
  return row[field] === undefined ? null : row[field];
}

/* ------------------------------------------------------------------ members */

/**
 * Members_model::get_members($limit, $offset, $param) — SQL_CALC_FOUND_ROWS query on wl_customers.
 * param: { status, customer_id, where (literal SQL written in code) }. With $limit == '1' PHP returned the first
 * row (or NULL); otherwise all rows.
 */
async function getMembers(ci, limit, offset, param = {}) {
  const keyword = trim(ci.input.getPost('keyword', true));
  const conds = [];
  if (str(param.customer_id) !== '') conds.push(sql`customers_id = ${str(param.customer_id)}`);
  if (str(param.status) !== '') conds.push(sql`status = ${str(param.status)}`);
  if (str(param.where) !== '') conds.push(sql.raw(param.where));
  if (keyword !== '') {
    const like = `%${keyword}%`;
    conds.push(sql`(user_name LIKE ${like} OR CONCAT_WS(' ',first_name,last_name) LIKE ${like} OR gender LIKE ${like} )`);
  }
  conds.push(sql`status < '2'`);
  const lim = parseInt(str(limit), 10) || 0;
  const off = parseInt(str(offset), 10) || 0;
  const limitSql = lim ? (off ? sql` LIMIT ${off}, ${lim}` : sql` LIMIT ${lim}`) : sql``;
  const rows = await fetchAll(
    ci.db,
    sql`SELECT SQL_CALC_FOUND_ROWS *,CONCAT_WS(' ',first_name,last_name) AS name FROM wl_customers WHERE ${sql.join(conds, sql` AND `)} ORDER BY customers_id desc${limitSql}`,
  );
  if (str(limit) === '1') return rows.length ? rows[0] : null;
  return rows;
}

/** Members_model::get_member_row($id, $condition) — find() on wl_customers; `cond` is an sql fragment. */
async function getMemberRow(db, id, cond = sql``) {
  const { rows } = await findAll(db, 'wl_customers', {
    condition: sql`status !='2' AND customers_id=${Number(id)} ${cond} `,
    start: 0,
    limit: 1,
  });
  return rows ? rows[0] : null;
}

/** The customer row with the fields Member.php reads back after an update. */
function customerSummary(db, userId, extra = '') {
  return fetchAll(
    db,
    sql`SELECT customers_id as user_id,user_name,first_name,last_name,CONCAT(first_name," ",last_name) as name,customer_photo,mobile_number${sql.raw(
      extra,
    )} FROM wl_customers WHERE 1 AND customers_id=${str(userId)}`,
  );
}

/** Users_model::is_email_exits(array(...)) — TRUE only when exactly one active customer matches. */
async function isEmailExists(db, field, value, userId) {
  const rows = await fetchAll(
    db,
    sql`SELECT customers_id FROM wl_customers WHERE ${ident(field)} = ${str(value)} AND customers_id != ${str(userId)} AND status != '2' AND status != '3'`,
  );
  return rows.length === 1;
}

/** Members_model::get_member_address_book($customer_id, 'Ship') — { rows|null, total }. */
function getMemberAddressBook(db, customerId, addressType) {
  return findAll(db, 'wl_customers_address_book', {
    condition: sql`customer_id =${Number(customerId)}  AND address_type =${str(addressType)}`,
  });
}

/* ------------------------------------------------------------------ wishlist */

/**
 * Members_model::get_wislists($offset, $per_page, array('user_id'=>...)) through MY_Model::myCustomJoin():
 * a COUNT(*) over the joins (before GROUP BY), then the SQL_CALC_FOUND_ROWS select. Returns { rows, total }
 * where rows is "" when the count was 0 (PHP returned "").
 */
async function getWishlists(ci, offset, perPage, userId) {
  const keyword = trim(ci.input.post('keyword', true));
  let cond = sql`wlstock.product_price > 0 AND wp.status ='1' AND wis.customer_id = ${str(userId)}`;
  if (keyword !== '') {
    const like = `%${keyword}%`;
    cond = sql`${cond} AND ( wp.product_name LIKE ${like} OR wp.product_code LIKE ${like} ) `;
  }
  const from = sql`FROM wl_products AS wp INNER JOIN wl_wishlists AS wis ON wis.product_id=wp.products_id INNER JOIN wl_product_stock AS wlstock ON wlstock.product_id=wp.products_id WHERE ${cond}`;
  const countRow = await fetchRow(ci.db, sql`SELECT COUNT(*) AS numrows ${from}`);
  const total = countRow ? Number(countRow.numrows) : 0;
  const lim = Number(perPage);
  const off = Number(offset) || 0;
  const limitSql = lim ? (off ? sql` LIMIT ${off}, ${lim}` : sql` LIMIT ${lim}`) : sql``;
  const rows = await fetchAll(
    ci.db,
    sql`SELECT SQL_CALC_FOUND_ROWS wp.*,wis.wishlists_date_added,wis.wishlists_id, IF(wlstock.product_discounted_price = 0,wlstock.product_price, wlstock.product_discounted_price ) as price, wlstock.product_price, wlstock.product_discounted_price, ( SELECT bnd.brand_name FROM wl_brands AS bnd WHERE wp.brand_id=bnd.brand_id ) AS brand_name, IF(wis.wishlists_id is null,0,1) as wishlist ${from} GROUP BY wis.wishlists_id ORDER BY wis.wishlists_date_added DESC${limitSql}`,
  );
  return { rows: total > 0 ? rows : '', total };
}

/** get_db_field_value('wl_products_media', 'media', " AND products_id =<id> ORDER BY id ASC LIMIT 1") */
async function firstProductMedia(db, productId) {
  const row = await fetchRow(db, sql`SELECT media FROM wl_products_media WHERE 1 AND products_id =${str(productId)} ORDER BY id ASC LIMIT 1`);
  return row ? row.media : null;
}

/** DELETE FROM wl_wishlists WHERE wishlists_id='<id>' AND customer_id ='<user>' */
function deleteWishlist(db, id, userId) {
  return db.execute(sql`DELETE FROM wl_wishlists WHERE wishlists_id=${str(id)} AND customer_id =${str(userId)}`);
}

/**
 * Default product image: rows of the LEFT JOIN wl_products/wl_products_media query the controller ran per
 * product. `brokenTable` reproduces print_invoice()'s table name with a leading space ("` wl_products_media`").
 */
function productDefaultMedia(db, productId, brokenTable = false) {
  const media = brokenTable ? '` wl_products_media`' : '`wl_products_media`';
  const select = brokenTable ? ' SELECT wlpm.media' : ' SELECT  wlpm.media';
  return fetchAll(
    db,
    sql`${sql.raw(select)} FROM \`wl_products\` as \`wlp\` LEFT JOIN ${sql.raw(media)} AS \`wlpm\` ON \`wlp\`.\`products_id\`=\`wlpm\`.\`products_id\` AND \`wlpm\`.\`is_default\` = 'Y' WHERE \`wlp\`.\`products_id\` = ${str(productId)} AND \`wlp\`.\`status\` != '2' GROUP BY \`wlp\`.\`products_id\` ORDER BY \`wlp\`.\`products_id\` DESC LIMIT 1 `,
  );
}

/** file_exists(UPLOAD_DIR."/products/".$media) */
function productImageExists(media) {
  return fs.existsSync(path.join(env.uploadDir, 'products', str(media)));
}

/* ------------------------------------------------------------------ reasons / orders */

function getReasons(db, reasonType) {
  return fetchAll(db, sql`SELECT reason_id, reason_name FROM wl_reasons WHERE status = '1' AND reason_type = ${str(reasonType)} ORDER BY sort_order asc `);
}

/**
 * Order_model::get_orders($offset, $per_page, $condition) — `condition` is an sql fragment starting with "AND".
 * Returns { rows|null, total }.
 */
function getOrders(ci, offset, perPage, condition) {
  const keyword = trim(ci.input.getPost('keyword', true));
  const orderStatus = trim(ci.input.getPost('order_status', true));
  const customersId = trim(ci.input.getPost('customers_id', true));
  let cond = sql`order_status !='Deleted' ${condition} `;
  if (keyword !== '') {
    const like = `%${keyword}%`;
    const prefix = `${keyword}%`;
    cond = sql`${cond} AND ( invoice_number LIKE ${like} OR  CONCAT_WS(' ',first_name,last_name) LIKE ${like} OR  email LIKE ${like}  OR  payment_status LIKE ${prefix} OR  order_status LIKE ${prefix} ) `;
  }
  if (orderStatus !== '') cond = sql`${cond} AND ( order_status = ${orderStatus} ) `;
  if (customersId !== '') cond = sql`${cond} AND ( customers_id = ${customersId} ) `;
  return findAll(ci.db, 'wl_order', { condition: cond, order: 'order_id DESC', start: offset, limit: perPage });
}

/** Select * from wl_orders_products where orders_id='<id>' limit 1 */
function firstOrderProduct(db, orderId) {
  return fetchAll(db, sql`Select * from wl_orders_products where orders_id=${str(orderId)} limit 1 `);
}

/* ------------------------------------------------------------------ supports / notifications */

/**
 * Members_model::get_supports('', 0, array('where'=>..., 'orderby'=>'id desc')) and
 * get_member_notifications(...) — same shape, different table. `where` is an sql fragment.
 */
function listWithKeyword(ci, table, where, orderby) {
  const keyword = str(ci.input.getPost('keyword'));
  let cond = sql`ord.status !='2' `;
  if (keyword !== '') {
    const like = `%${keyword}%`;
    cond = sql`${cond} AND  ( name LIKE ${like} OR email LIKE ${like} OR comment LIKE ${like} ) `;
  }
  return fetchAll(ci.db, sql`SELECT SQL_CALC_FOUND_ROWS ord.* FROM ${sql.raw(table)} as ord WHERE ${where} AND ${cond} ORDER BY ${sql.raw(orderby)}`);
}

const getSupports = (ci, where) => listWithKeyword(ci, 'wl_supports', where, 'id desc');
const getMemberNotifications = (ci, where) => listWithKeyword(ci, 'wl_member_notifications', where, 'id desc');

/**
 * Members_model::get_support_inquiry() via MY_Model::custom_query_builder(): COUNT(*) query (with the GROUP BY,
 * so total is the first group's count) and, when it is > 0, the select. Returns { rows|null, total }.
 */
async function getSupportInquiry(db, { fields, where, groupby = null, orderby, limit = null, offset = 0 }) {
  const group = groupby ? sql` GROUP BY ${sql.raw(groupby)}` : sql``;
  const base = sql`FROM wl_support_enquiry as inq WHERE ${where}${group}`;
  const countRow = await fetchRow(db, sql`SELECT COUNT(*) AS numrows ${base}`);
  const total = countRow ? Number(countRow.numrows) : 0;
  if (!(total > 0)) return { rows: null, total };
  let limitSql = sql``;
  if (limit !== null && limit > 0) limitSql = offset ? sql` LIMIT ${offset}, ${limit}` : sql` LIMIT ${limit}`;
  const rows = await fetchAll(db, sql`SELECT ${sql.raw(fields)} ${base} ORDER BY ${sql.raw(orderby)}${limitSql}`);
  return { rows, total };
}

/* ------------------------------------------------------------------ reviews / coupons */

/** Product_model::get_reviews(10000, 0, array('where'=>" member_id='<id>' ", 'rev_status'=>'1', 'rev_type'=>'P')) */
function getMemberReviews(ci, userId) {
  const keyword = trim(ci.input.getPost('keyword', true));
  let cond = sql`rev.rev_type = 'P' AND rev.status = '1'`;
  if (keyword !== '') {
    const like = `%${keyword}%`;
    cond = sql`${cond} AND (prd.product_name LIKE ${like} OR rev.poster_name LIKE ${like} OR rev.email LIKE ${like} )`;
  }
  return fetchAll(
    ci.db,
    sql`SELECT SQL_CALC_FOUND_ROWS rev.*,prd.product_name,prd.products_id FROM wl_review as rev LEFT JOIN wl_products AS prd ON rev.entity_id=prd.products_id WHERE ${cond} AND  member_id=${str(userId)}  ORDER BY rev.review_id desc LIMIT 10000`,
  );
}

/** Coupons_model::get_discount_coupon($offset, $limit, array('where'=>...)) — `where` is an sql fragment. */
async function getDiscountCoupon(ci, offset, limit, where) {
  const lim = parseInt(str(limit), 10) || 0;
  const off = parseInt(str(offset), 10) || 0;
  let limitSql = sql``;
  if (str(limit) !== '' && lim) limitSql = off ? sql` LIMIT ${off}, ${lim}` : sql` LIMIT ${lim}`;
  const rows = await fetchAll(
    ci.db,
    sql`SELECT SQL_CALC_FOUND_ROWS wlc.* FROM wl_coupons as wlc LEFT JOIN wl_coupon_customers AS wlcc ON wlc.coupon_id=wlcc.coupon_id WHERE ${where} AND wlc.status != '2' GROUP BY wlc.coupon_id ORDER BY wlc.coupon_id desc${limitSql}`,
  );
  if (eq(limit, '1')) return rows.length ? rows[0] : null;
  return rows;
}

/* ------------------------------------------------------------------ misc */

/** get_db_field_value('wl_currencies', $field, array('is_default'=>'Y')) */
async function defaultCurrencyField(db, field) {
  const row = await fetchRow(db, sql`SELECT ${sql.raw(field)} FROM wl_currencies WHERE 1 AND is_default=${'Y'}`);
  return row ? row[field] : null;
}

/** count_record('wl_customers_address_book', "customer_id='<id>' AND default_status='Y' ") */
async function countDefaultAddresses(db, userId) {
  const row = await fetchRow(db, sql`SELECT COUNT(*) AS numrows FROM wl_customers_address_book WHERE customer_id=${str(userId)} AND default_status='Y'`);
  return Number(row.numrows);
}

/** count_record('wl_customers', "customers_id='<id>'") */
async function countCustomer(db, userId) {
  const row = await fetchRow(db, sql`SELECT COUNT(*) AS numrows FROM wl_customers WHERE customers_id=${str(userId)}`);
  return Number(row.numrows);
}

/** $this->db->from('wl_referral_customers')->where($conditions)->count_all_results() */
async function countReferrals(db, yourEmail, friendEmail, userId) {
  const row = await fetchRow(
    db,
    sql`SELECT COUNT(*) AS \`numrows\`
FROM \`wl_referral_customers\`
WHERE \`posted_user\` = ${str(yourEmail)} AND \`refer_user\` = ${str(friendEmail)} AND \`poster_id\` = ${str(userId)} `,
  );
  return Number(row.numrows);
}

/** select * from wl_referral_customers where 1 and refer_user='..' and posted_user='..' */
function findReferral(db, friendEmail, yourEmail) {
  return fetchAll(db, sql` select * from wl_referral_customers where 1 and refer_user=${str(friendEmail)} and posted_user=${str(yourEmail)}`);
}

/** count_notificationssss(): unread wl_notifications of the user. */
function countUnreadNotifications(db, userId) {
  return fetchAll(
    db,
    sql`SELECT count(notification_id) as total_rows FROM wl_notifications WHERE read_status='0' AND customer_id =${str(userId)} ORDER BY notification_id ASC `,
  );
}

module.exports = {
  insertRow,
  updateRows,
  deleteRows,
  dbFieldValue,
  getMembers,
  getMemberRow,
  customerSummary,
  isEmailExists,
  getMemberAddressBook,
  getWishlists,
  firstProductMedia,
  deleteWishlist,
  productDefaultMedia,
  productImageExists,
  getReasons,
  getOrderMaster,
  getOrderDetail,
  getOrders,
  firstOrderProduct,
  getSupports,
  getMemberNotifications,
  getSupportInquiry,
  getMemberReviews,
  getDiscountCoupon,
  defaultCurrencyField,
  countDefaultAddresses,
  countCustomer,
  countReferrals,
  findReferral,
  countUnreadNotifications,
  getFoundRows,
};
