/**
 * Database-backed helper functions shared by several API controllers
 * (apps/helpers/utils_helper.php, currency_helper.php, modules/products/helpers/product_helper.php).
 */
const { sql } = require('drizzle-orm');
const { fetchAll, fetchRow } = require('./common.model');
const { asObject, asObjects, numberFormat, num, str } = require('../utils/php');

/** get_content($tbl = 'wl_auto_respond_mails', $pageId): the row as a PHP object, or null. */
async function getContent(db, table, pageId) {
  if (!(num(pageId) > 0)) return null;
  const row = await fetchRow(db, sql`SELECT * FROM ${sql.raw(table)} WHERE id = ${str(pageId)}`);
  return row ? asObject(row) : null;
}

/**
 * get_product_price($cond): cheapest stock row with a price — { product_price, product_discounted_price,
 * product_quantity, inventory, deal_price } — or null. `cond` is an sql fragment like sql` AND product_id = ${id}`.
 */
function getProductPrice(db, cond = sql``) {
  return fetchRow(
    db,
    sql`SELECT product_price, product_discounted_price, product_quantity, inventory, deal_price FROM wl_product_stock WHERE 1 AND product_price > 0 ${cond} order by product_price asc`,
  );
}

/** product_overall_rating($product_id, $entity_type): AVG(rate) as a string, or null when there are no reviews. */
async function productOverallRating(db, productId) {
  const row = await fetchRow(db, sql`SELECT AVG(rate) as rating FROM  wl_review WHERE entity_id  =${str(productId)} AND status ='1' AND rev_type='P' `);
  return row.rating;
}

/** The default currency row (API requests carry no session, so it is read every time). */
function defaultCurrency(db) {
  return fetchRow(db, sql`SELECT * FROM wl_currencies WHERE is_default='Y' AND status='1' `);
}

/** display_symbol(): left symbol, else right symbol; null when there is no default currency. */
async function displaySymbol(db) {
  const cur = await defaultCurrency(db);
  if (!cur) return null;
  return cur.symbol_left !== '' && cur.symbol_left !== null ? cur.symbol_left : cur.symbol_right;
}

/** display_price($price): price converted with the default currency, number_format(..., 2) with its symbol. */
async function displayPrice(db, price) {
  const cur = await defaultCurrency(db);
  const value = cur ? num(cur.value) : 0;
  const left = cur ? cur.symbol_left : null;
  const right = cur ? cur.symbol_right : null;
  const formatted = numberFormat(num(price) * value, 2);
  return left !== '' && left !== null ? left + formatted : formatted + str(right);
}

/** site_currency(): active default currencies as PHP objects (always an array). */
async function siteCurrency(db) {
  return asObjects(await fetchAll(db, sql`SELECT * FROM wl_currencies WHERE status='1' AND is_default ='Y' `));
}

/** get_orders_id($user_id): latest non-cancelled/deleted order id ('' if none). */
async function getOrdersId(db, userId) {
  const rows = await fetchAll(
    db,
    sql`select order_id from wl_order where customers_id=${str(userId)}  AND (order_status!='Cancelled' AND order_status!='Deleted') order by order_id desc limit 1 `,
  );
  return rows.map((r) => r.order_id).join(',');
}

/**
 * Order ids string "1,2" -> values for IN (...). PHP interpolated the string raw, so an empty string produced
 * "IN ()" — a MySQL syntax error (HTTP 500 database error page); that is reproduced.
 */
function idList(orderIds) {
  if (str(orderIds).trim() === '') return sql.raw(str(orderIds));
  return sql.join(
    str(orderIds)
      .split(',')
      .map((v) => sql`${v.trim()}`),
    sql`,`,
  );
}

/** get_order_products_id($order_id): product ids of the given order ids, comma separated. */
async function getOrderProductsId(db, orderIds) {
  const rows = await fetchAll(db, sql`select products_id from wl_orders_products where orders_id IN (${idList(orderIds)}) `);
  return rows.map((r) => r.products_id).join(',');
}

/** get_order_products_review_id($order_id, $user_id): ordered product ids the user has not reviewed yet. */
async function getOrderProductsReviewId(db, orderIds, userId) {
  const rows = await fetchAll(db, sql`select products_id from wl_orders_products where orders_id IN (${idList(orderIds)}) `);
  const out = [];
  for (const r of rows) {
    const reviewed = await fetchRow(
      db,
      sql`SELECT review_id FROM \`wl_review\` WHERE \`entity_id\`=${str(r.products_id)} and \`rev_type\`='P' AND member_id=${str(userId)} `,
    );
    if (!reviewed) out.push(r.products_id);
  }
  return out.join(',');
}

module.exports = {
  getContent,
  getProductPrice,
  productOverallRating,
  displaySymbol,
  displayPrice,
  siteCurrency,
  getOrdersId,
  getOrderProductsId,
  getOrderProductsReviewId,
};
