/**
 * Queries used by modules/api/controllers/User.php: users/users_model (MY_Model find / safe_insert /
 * safe_update, is_email_exits, activate_account), the Auth library (verify_user, update_last_login) and the
 * dbquery helpers the controller calls directly.
 *
 * Writes are built like CodeIgniter's insert_string()/update_string() (column names written in code, values
 * as parameters) instead of the shared Drizzle-based safe_insert/safe_update: several PHP writes name columns
 * that do not exist in the database (verify_code, referral_code, ...), and MySQL must raise the same
 * "Unknown column" error PHP got.
 */
const { sql } = require('drizzle-orm');
// MY_Model::safe_insert()/safe_update() — the shared writers accept table names and use CI escaping.
const { fetchAll, fetchRow, getDbFieldValue, getDbSingleRow, countRecord, customResultSet, safeInsert, safeUpdate, ciValue: value } = require('./common.model');
const safeEncrypt = require('../utils/safeEncrypt');
const { str, ucwords } = require('../utils/php');

const ident = (name) => sql.raw(`\`${name}\``);

/* ------------------------------------------------------------------ Auth library */

/**
 * Auth::verify_user($username, $password, '', $type, 'mobile'): the session data array on a unique match
 * (also stores it in the session and runs update_last_login()), otherwise false.
 */
async function verifyUser(ci, username, password) {
  const encoded = safeEncrypt.encode(password);
  const rows = await fetchAll(
    ci.db,
    sql`SELECT customers_id,user_name,first_name,last_name,title,login_type,is_blocked,last_login_date,current_login,block_time,mobile_number,customer_type,is_verified,is_verified_mobile,status
      FROM wl_customers
      WHERE (user_name=${str(username)} OR mobile_number=${str(username)} ) AND password = ${value(encoded)} AND status <> '2' AND is_verified = '1'`,
  );
  if (rows.length !== 1) return false;
  const row = rows[0];
  const data = {
    user_id: row.customers_id,
    name: ucwords(`${str(row.first_name)} ${str(row.last_name)}`),
    login_type: row.login_type,
    customer_type: row.customer_type,
    username: row.user_name,
    title: row.title,
    first_name: row.first_name,
    last_name: row.last_name,
    is_verified: row.is_verified,
    is_verified_mobile: row.is_verified_mobile,
    mobile_number: row.mobile_number,
    is_blocked: row.is_blocked,
    blocked_time: row.block_time,
    status: row.status,
    logged_in: true,
  };
  for (const [k, v] of Object.entries(data)) ci.session.set(k, v);
  // update_last_login()
  await safeUpdate(
    ci.db,
    'wl_customers',
    { last_login_date: row.current_login, current_login: ci.config('config.date.time') },
    { customers_id: ci.session.get('user_id') },
  );
  return data;
}

/* ------------------------------------------------------------------ tokens */

/**
 * get_db_field_value('wl_apl_tokens','token', " AND user_id = '..' AND app_type= '..' AND app_id = '..'
 * [AND login_type ='x'] AND provider='..' AND expired_at IS NULL ").
 */
function findActiveToken(db, { userId, appType, appId, loginType = null, provider }) {
  const lt = loginType === null ? sql`` : sql` AND login_type =${loginType}`;
  return getDbFieldValue(
    db,
    'wl_apl_tokens',
    'token',
    sql` AND user_id = ${str(userId)}  AND app_type= ${str(appType)} AND app_id = ${str(appId)}${lt} AND provider=${provider} AND expired_at IS NULL `,
  );
}

function insertToken(db, data) {
  return safeInsert(db, 'wl_apl_tokens', data);
}

/** safe_update('wl_apl_tokens', {expired_at: now}, {app_id, 'token!=': token, provider}) */
function expireOtherTokens(db, { now, appId, token, provider }) {
  return safeUpdate(db, 'wl_apl_tokens', { expired_at: now }, { app_id: appId, 'token!=': token, provider });
}

/* ------------------------------------------------------------------ customers */

/** get_db_field_value('wl_currencies', field, array('is_default'=>'Y')) */
function defaultCurrencyField(db, field) {
  return getDbFieldValue(db, 'wl_currencies', field, { is_default: 'Y' });
}

/** MY_Model::find($table, {field, condition, order}): first row (LIMIT 0,1) or null. */
async function find(db, table, field, condition, order = null) {
  const orderSql = order ? sql` ORDER BY ${sql.raw(order)}` : sql``;
  const row = await fetchRow(db, sql`SELECT ${sql.raw(field)} FROM ${sql.raw(table)} WHERE ${condition}${orderSql} LIMIT 0, 1`);
  // findAll() also stored total_rec_found (a COUNT(*) over the same condition); it is never read here.
  await fetchRow(db, sql`SELECT COUNT(*) AS numrows FROM ${sql.raw(table)} WHERE ${condition}`);
  return row;
}

/** face_authotication: active customer with face authentication enabled for the device. */
function findFaceCustomer(db, deviceId) {
  return find(
    db,
    'wl_customers',
    'customers_id,user_name,password,first_name,last_name,is_verified_mobile,status,mobile_number,customer_photo',
    sql`(device_id =${str(deviceId)} ) AND status ='1' AND is_face_authentication='1' `,
    'customers_id DESC',
  );
}

/** forgotten_password / transporter_forgotten_password: user_name or mobile match with status 1. */
function findPasswordAccount(db, table, userName) {
  return find(
    db,
    table,
    'user_name,password,first_name,last_name',
    sql`(user_name =${str(userName)} OR mobile_number =${str(userName)}) AND status ='1' `,
  );
}

/** get_db_field_value('wl_customers', field, " AND <col> ='<v>' AND status <> '2' ") */
function customerFieldNotDeleted(db, col, v) {
  return getDbFieldValue(db, 'wl_customers', col, sql` AND ${sql.raw(col)} =${str(v)} AND status <> '2' `);
}

/** Users_model::is_email_exits($data): exactly one customer that is not deleted/guest. */
async function isEmailExists(db, col, v) {
  const rows = await fetchAll(db, sql`SELECT ${ident('customers_id')} FROM ${ident('wl_customers')} WHERE ${ident(col)} = ${str(v)} AND ${ident('status')} != '2' AND ${ident('status')} != '3'`);
  return rows.length === 1;
}

/** checkreferral(): referral lookup (the table name is the PHP one). */
async function countReferral(db, referralCode, email) {
  const rows = await fetchAll(
    db,
    sql` select refer_id from wl_referral_customers where 1 and referral_code=${str(referralCode)} and refer_user=${str(email)}`,
  );
  return rows.length;
}

/** get_db_field_value('wl_customers','verify_code', array('customers_id'=>$id)) */
function customerVerifyCode(db, customerId) {
  return getDbFieldValue(db, 'wl_customers', 'verify_code', { customers_id: customerId });
}

/** get_db_field_value(table, field, array(...)) */
function fieldValue(db, table, field, where) {
  return getDbFieldValue(db, table, field, where);
}

/** get_db_single_row(table, fields, array(...)) — PHP echoed a debug message for multi-row results. */
function singleRow(ci, table, fields, where) {
  return getDbSingleRow(ci.db, table, fields, where, ci.out);
}

/** get_db_single_row('tbl_admin','*'," AND admin_id='1' ") */
function adminRow(ci) {
  return getDbSingleRow(ci.db, 'tbl_admin', '*', sql` AND admin_id='1' `, ci.out);
}

/** Users_model::activate_account($cid) up to its redirect. */
async function activateAccount(db, cid) {
  const isVerified = await getDbFieldValue(db, 'wl_customers', 'is_verified', sql` AND md5(customers_id)=${str(cid)}`);
  return isVerified;
}

function markVerifiedByMd5(db, cid) {
  return db.execute(sql`update wl_customers set is_verified='1' where md5(customers_id)=${str(cid)}`);
}

/** count_record('wl_customers', "<col> ='<v>' ") */
function countCustomers(db, col, v) {
  return countRecord(db, 'wl_customers', sql`${sql.raw(col)} =${str(v)} `);
}

/** guest_login: attach the device's temporary cart data to the user. */
async function assignTempData(db, registerId, appId) {
  for (const table of ['tbl_temp_cart', 'tbl_temp_delivery', 'tbl_temp_delivery_address', 'tbl_temp_discountcoupon', 'tbl_temp_shipping']) {
    await db.execute(sql`UPDATE ${sql.raw(table)} set user_id = ${value(registerId)} where app_id =${str(appId)}`);
  }
}

/** country(): India with its language row. */
function countries(db, languageId) {
  return customResultSet(
    db,
    sql`SELECT wc.id, wcl.country_name FROM wl_countries as wc INNER JOIN wl_countries_lang as wcl ON wc.id=wcl.country_id where wc.status='1' AND wc.id='114' and wcl.language_id=${str(languageId)} `,
  );
}

function states(db, countryId) {
  const cond = countryId === undefined ? sql`` : sql` AND country_id=${countryId}`;
  return customResultSet(db, sql`SELECT * FROM wl_states WHERE status='1' ${cond} ORDER BY id ASC `);
}

function cities(db, stateId) {
  const cond = stateId === undefined ? sql`` : sql` AND state_id=${stateId}`;
  return customResultSet(db, sql`SELECT id,title,state_id FROM wl_cities WHERE status='1' ${cond} ORDER BY title ASC `);
}

/** transporter_login: the transporter matching user name/mobile and password. */
async function findTransporter(db, username, encodedPassword) {
  return fetchAll(
    db,
    sql`SELECT transporter_id,user_name,first_name,last_name,is_blocked,last_login_date,current_login,block_time,mobile_number,status,is_online
      FROM wl_transporters WHERE (user_name = ${str(username)} OR mobile_number =${str(username)}) AND password = ${value(encodedPassword)} AND status != '2'`,
  );
}

module.exports = {
  value,
  safeInsert,
  safeUpdate,
  verifyUser,
  findActiveToken,
  insertToken,
  expireOtherTokens,
  defaultCurrencyField,
  findFaceCustomer,
  findPasswordAccount,
  customerFieldNotDeleted,
  isEmailExists,
  countReferral,
  customerVerifyCode,
  fieldValue,
  singleRow,
  adminRow,
  activateAccount,
  markVerifiedByMd5,
  countCustomers,
  assignTempData,
  countries,
  states,
  cities,
  findTransporter,
};
