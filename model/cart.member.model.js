/**
 * Members_model / Cart_model / product queries used by the basket half of modules/api/controllers/Cart.php:
 * notifications and wishlist counters, wishlist insert, address book, products, colours/sizes.
 */
const { sql } = require('drizzle-orm');
const { fetchAll, fetchRow, findAll, getFoundRows, safeInsert, safeUpdate, safeDelete } = require('./common.model');
const { wlWishlists, wlCustomersAddressBook, tblTempDeliveryAddress } = require('../schema');
const { str, intval, num, trim } = require('../utils/php');

/* ---------------------------------------------------------- counters (FOUND_ROWS) */

/**
 * Members_model::get_member_notifications('', 0, {where: "member_id = '<id>' AND is_read='0' ", orderby: 'id desc'})
 * followed by get_found_rows(). Returns FOUND_ROWS() (string).
 */
async function unreadNotificationsFoundRows(ci, memberId) {
  const keyword = str(ci.input.getPost('keyword'));
  let where = sql`member_id = ${str(memberId)} AND  is_read='0' AND ord.status !='2' `;
  if (keyword !== '') {
    const like = `%${keyword}%`;
    where = sql`${where} AND  ( name LIKE ${like} OR email LIKE ${like} OR comment LIKE ${like} ) `;
  }
  await fetchAll(ci.db, sql`SELECT SQL_CALC_FOUND_ROWS ord.* FROM wl_member_notifications as ord WHERE ${where} ORDER BY id desc`);
  return getFoundRows(ci.db);
}

/**
 * Members_model::get_wislists(0, 2, {user_id}) followed by get_found_rows(): the number of wishlist rows
 * (grouped by wishlists_id) of the member whose product is active and has a priced stock row (string).
 */
async function wishlistFoundRows(ci, userId) {
  const keyword = trim(ci.input.post('keyword', true));
  let where = sql`wlstock.product_price > 0 AND wp.status ='1' AND wis.customer_id = ${str(userId)}`;
  if (keyword !== '') {
    const like = `%${keyword}%`;
    where = sql`${where} AND ( wp.product_name LIKE ${like} OR wp.product_code LIKE ${like} ) `;
  }
  await fetchAll(
    ci.db,
    sql`SELECT SQL_CALC_FOUND_ROWS wp.*,wis.wishlists_date_added,wis.wishlists_id, IF(wlstock.product_discounted_price = 0,wlstock.product_price, wlstock.product_discounted_price ) as price, wlstock.product_price, wlstock.product_discounted_price, ( SELECT bnd.brand_name FROM wl_brands AS bnd WHERE wp.brand_id=bnd.brand_id ) AS brand_name, IF(wis.wishlists_id is null,0,1) as wishlist FROM wl_products AS wp INNER JOIN wl_wishlists AS wis ON wis.product_id=wp.products_id INNER JOIN wl_product_stock AS wlstock ON wlstock.product_id=wp.products_id WHERE ${where} GROUP BY wis.wishlists_id ORDER BY wis.wishlists_date_added DESC LIMIT 2`,
  );
  return getFoundRows(ci.db);
}

/* ------------------------------------------------------------------ wishlist */

/** count_record('wl_wishlists', "customer_id = '..' AND product_id = '..' ") */
async function countWishlist(db, userId, productId) {
  const row = await fetchRow(db, sql`SELECT COUNT(*) AS numrows FROM wl_wishlists WHERE customer_id = ${str(userId)} AND product_id = ${str(productId)} `);
  return intval(row.numrows);
}

/** Cart_model::add_wislists($prodId, $memId) */
async function addWishlist(ci, productId, userId) {
  if (!(num(productId) > 0 && num(userId) > 0)) return;
  const cond = sql`customer_id =${str(userId)} AND product_id =${str(productId)}`;
  const rows = await fetchAll(ci.db, sql`SELECT * FROM wl_wishlists WHERE ${cond} LIMIT 1`);
  await fetchRow(ci.db, sql`SELECT COUNT(*) AS numrows FROM wl_wishlists WHERE ${cond}`);
  if (rows.length > 0) return;
  await safeInsert(ci.db, wlWishlists, {
    customer_id: userId,
    product_id: productId,
    wishlists_date_added: ci.config('config.date.time'),
  });
}

/* ------------------------------------------------------------- address book */

/** Members_model::get_member_address_book($customer_id, 'Ship'): rows or null (null for customer 0). */
async function memberAddressBook(db, customerId, addressType) {
  const id = intval(customerId);
  if (id === 0) return null; // PHP 7: 0 != '' is false
  let cond = sql`customer_id =${id} `;
  if (addressType !== '') cond = sql`${cond} AND address_type =${str(addressType)}`;
  const { rows } = await findAll(db, 'wl_customers_address_book', { condition: cond });
  return rows;
}

/** Members_model::get_member_address_book_guest($customer_id, 'Ship'): rows or null. */
async function memberAddressBookGuest(db, customerId, addressType) {
  const id = intval(customerId);
  if (id === 0) return null;
  let cond = sql`user_id =${id} `;
  if (addressType !== '') cond = sql`${cond} AND address_type =${str(addressType)}`;
  const { rows } = await findAll(db, 'tbl_temp_delivery_address', {
    field: 'tbl_temp_delivery_address.*,tbl_temp_delivery_address.user_id as customer_id,tbl_temp_delivery_address.id as address_id',
    condition: cond,
  });
  return rows;
}

const addressTable = (guest) => (guest ? tblTempDeliveryAddress : wlCustomersAddressBook);

/** count_record(<address table>, "<owner>='<id>' AND default_status='Y' ") */
async function countDefaultAddresses(db, guest, userId) {
  const owner = guest ? sql`user_id` : sql`customer_id`;
  const table = guest ? sql`tbl_temp_delivery_address` : sql`wl_customers_address_book`;
  const row = await fetchRow(db, sql`SELECT COUNT(*) AS numrows FROM ${table} WHERE ${owner}=${str(userId)} AND default_status='Y' `);
  return intval(row.numrows);
}

function insertAddress(db, guest, data) {
  return safeInsert(db, addressTable(guest), data);
}

/** safe_update with the edit_address() where clause */
function updateAddress(db, guest, data, userId, addressId) {
  const where = guest
    ? sql`user_id =${str(userId)} AND id=${str(addressId)} AND address_type='Ship'`
    : sql`customer_id =${str(userId)} AND address_id=${str(addressId)} AND address_type='Ship'`;
  return safeUpdate(db, addressTable(guest), data, where);
}

/** set_default_address(): every address of the user to 'N', then the chosen one to 'Y'. */
async function setDefaultAddress(db, guest, userId, addressId) {
  if (guest) {
    await safeUpdate(db, tblTempDeliveryAddress, { default_status: 'N' }, sql`user_id = ${str(userId)}`);
    await safeUpdate(db, tblTempDeliveryAddress, { default_status: 'Y' }, sql`id = ${str(addressId)}`);
  } else {
    await safeUpdate(db, wlCustomersAddressBook, { default_status: 'N' }, sql`customer_id = ${str(userId)}`);
    await safeUpdate(db, wlCustomersAddressBook, { default_status: 'Y' }, sql`address_id = ${str(addressId)}`);
  }
}

/** safe_delete(<table>, array(<id col> => $address_id)) — a NULL id becomes "IS NULL" (CI where-array). */
function deleteAddress(db, guest, addressId) {
  return guest ? safeDelete(db, tblTempDeliveryAddress, { id: addressId }) : safeDelete(db, wlCustomersAddressBook, { address_id: addressId });
}

/* ------------------------------------------------------------------ products */

/** Product_model::get_product_colors($id): rows (array) or null when the id is not positive. */
function productColors(db, productId) {
  const id = intval(productId);
  if (!(id > 0)) return null;
  return fetchAll(
    db,
    sql`SELECT wc.color_id, wc.color_name, wc.color_code, wpc.image FROM wl_product_colors as wpc LEFT JOIN wl_colors as wc ON wc.color_id=wpc.color_id LEFT JOIN wl_product_stock as wps ON wps.product_color=wpc.color_id WHERE wpc.product_id = ${id} GROUP BY wc.color_id ORDER BY wc.color_name asc`,
  );
}

/** Product_model::get_product_sizes($id) */
function productSizes(db, productId) {
  const id = intval(productId);
  if (!(id > 0)) return null;
  return fetchAll(
    db,
    sql`SELECT ws.size_id, ws.size_name FROM wl_product_sizes as wps JOIN wl_sizes as ws ON ws.size_id=wps.size_id JOIN wl_product_stock as wpst ON wpst.product_size=ws.size_id WHERE wps.product_id = ${id} GROUP BY wpst.product_size ORDER BY ws.size_name asc`,
  );
}

/** CI order_by($orderby) for a request-supplied string: "col [asc|desc], ..." with protected identifiers. */
function orderByFromRequest(orderby) {
  const parts = str(orderby)
    .split(',')
    .map((p) => trim(p))
    .filter((p) => p !== '')
    .map((p) => {
      const m = p.match(/^(\S+)(?:\s+(ASC|DESC))?$/i);
      const col = m ? m[1] : p;
      const dir = m && m[2] ? sql.raw(` ${m[2].toUpperCase()}`) : sql``;
      const ident = sql.join(col.split('.').map((s) => sql.identifier(s)), sql`.`);
      return sql`${ident}${dir}`;
    });
  return parts.length ? sql.join(parts, sql`, `) : null;
}

/**
 * Product_model::get_products(1, 0, {productid, wish_user_id}) as called by add_cart(): the first row or null.
 * Request inputs keyword2, search_prod_type and sortby are applied like the model did.
 */
async function getProduct(ci, productId, wishUserId) {
  const keyword = trim(ci.input.getPost('keyword2', true));
  const conds = [];
  if (str(productId) !== '') conds.push(sql`wlp.products_id = ${str(productId)}`);
  const searchType = ci.input.getPost('search_prod_type', true);
  if (str(searchType) !== '') conds.push(sql`wlp.${sql.identifier(str(searchType))} = '1'`);
  if (keyword !== '') conds.push(sql`(wlp.product_name LIKE ${`%${keyword}%`} OR wlp.product_code LIKE ${`%${keyword}%`} )`);
  conds.push(sql`wlp.status != '2'`);
  conds.push(sql`wlstock.product_price > '0'`);

  let orderby = '';
  const sortby = ci.input.getPost('sortby');
  const order = [];
  if (str(sortby) !== '') orderby = str(sortby);
  if (orderby !== '') {
    if (orderby === 'lth') order.push(sql`price ASC`);
    if (orderby === 'htl') order.push(sql`price DESC`);
    if (orderby === 'az') order.push(sql`product_name ASC`);
    if (orderby === 'za') order.push(sql`product_name DESC`);
  }
  if (!['lth', 'htl', 'az', 'za'].includes(orderby)) {
    const o = orderByFromRequest(orderby);
    if (o) order.push(o);
  }
  if (orderby === '') order.push(sql`wlp.products_id DESC`);

  const wish = str(intval(wishUserId));
  const row = await fetchRow(
    ci.db,
    sql`SELECT SQL_CALC_FOUND_ROWS wlp.*,wlp.status as product_status,wlpm.media,wlpm.media_type,wlpm.is_default,(SELECT count(review_id) FROM wl_review WHERE entity_id=wlp.products_id AND rev_type = 'P' AND status = '1' ) AS review_count, IF(wlstock.product_discounted_price = 0,wlstock.product_price, wlstock.product_discounted_price ) as price, wlstock.product_price, wlstock.product_discounted_price, ( SELECT bnd.brand_name FROM wl_brands AS bnd WHERE wlp.brand_id=bnd.brand_id ) AS brand_name, IF(wlw.wishlists_id is null,0,1) as wishlist, wlw.wishlists_id FROM wl_products as wlp LEFT JOIN wl_products_media AS wlpm ON wlp.products_id=wlpm.products_id AND wlpm.type="main" INNER JOIN wl_product_stock AS wlstock ON wlp.products_id=wlstock.product_id LEFT JOIN wl_wishlists AS wlw ON wlp.products_id=wlw.product_id AND wlw.customer_id=${wish} WHERE ${sql.join(conds, sql` AND `)} GROUP BY wlp.products_id ORDER BY ${sql.join(order, sql`, `)} LIMIT 1`,
  );
  return row;
}

/**
 * thumbnail_helper get_image($dir, $image, $w, $h): the cached thumbnail URL when the source image and its
 * thumbnail exist in the upload directory, else the "no image" thumbnail, else the plain no-image URL.
 * Thumbnails are not generated here (PHP created them with GD on first use).
 */
module.exports = {
  unreadNotificationsFoundRows,
  wishlistFoundRows,
  countWishlist,
  addWishlist,
  memberAddressBook,
  memberAddressBookGuest,
  countDefaultAddresses,
  insertAddress,
  updateAddress,
  setDefaultAddress,
  deleteAddress,
  productColors,
  productSizes,
  getProduct,
};
