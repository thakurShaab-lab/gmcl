/**
 * Brand_model::get_brands(), Color_model::getcolors(), Size_model::getsizes() as used by
 * modules/api/controllers/Products.php.
 */
const { sql } = require('drizzle-orm');
const { fetchAll, findAll } = require('./common.model');
const { str, trim, neq } = require('../utils/php');

/** Brand_model::get_brands(array('status' => '1'), 0, '') — no LIMIT (limit '' casts to 0). */
function getActiveBrands(db) {
  return fetchAll(db, sql`SELECT SQL_CALC_FOUND_ROWS * FROM wl_brands WHERE status = '1' ORDER BY brand_name ASC`);
}

/**
 * Shared body of getcolors()/getsizes(): "status !='2' <condition>" plus the request's keyword and status filters.
 * Returns rows or null.
 */
async function attributeList(ci, table, nameColumn, order) {
  const keyword = trim(ci.input.getPost('keyword', true));
  const status = ci.input.getPost('status', true);
  let where = sql`status !='2'  AND status ='1'`;
  if (keyword !== '') where = sql`${where} AND ${sql.raw(nameColumn)} like ${`%${keyword}%`}`;
  if (neq(status, '')) where = sql`${where} AND status=${str(status)} `;
  const { rows } = await findAll(ci.db, table, { field: '*', condition: where, order, start: 0 });
  return rows;
}

/** Color_model::getcolors(field *, condition " AND status ='1'") */
const getActiveColors = (ci) => attributeList(ci, 'wl_colors as a', 'color_name', 'color_id DESC ');

/** Size_model::getsizes(field *, condition " AND status ='1'") */
const getActiveSizes = (ci) => attributeList(ci, 'wl_sizes as a', 'size_name', 'sort_order ASC ');

module.exports = { getActiveBrands, getActiveColors, getActiveSizes };
