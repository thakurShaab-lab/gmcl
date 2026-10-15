/** Queries from modules/category/models/Category_model.php used by the API. */
const { sql } = require('drizzle-orm');
const { findAll, getDbSingleRow } = require('./common.model');
const { trim, str } = require('../utils/php');

/**
 * Category_model::getcategory($opts) — findAll('wl_categories as a') with "status != '2'" prepended to the
 * condition, plus the request's keyword (xss-cleaned, trimmed) and status filters, ordered by sort_order.
 * opts: { field, condition (sql fragment starting with " AND ..."), order }
 */
async function getCategory(ci, { field = '*', condition = sql``, order = '' } = {}) {
  const keyword = trim(ci.input.getPost('keyword', true));
  const status = str(ci.input.getPost('status', true));
  let where = sql`status !='2' ${condition}`;
  if (keyword !== '') where = sql`${where} AND category_name like ${`%${keyword}%`}`;
  if (status !== '') where = sql`${where} AND status=${status} `;
  return findAll(ci.db, 'wl_categories as a', { field, condition: where, order: order || 'sort_order ASC ' });
}

/** get_db_single_row('wl_categories', '*', " AND wl_categories.category_id='<id>' ") */
function getCategoryRow(ci, categoryId) {
  return getDbSingleRow(ci.db, 'wl_categories', '*', sql` AND wl_categories.category_id=${str(categoryId)} `, ci.out);
}

module.exports = { getCategory, getCategoryRow };
