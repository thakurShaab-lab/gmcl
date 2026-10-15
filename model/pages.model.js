/**
 * Queries used by modules/api/controllers/Pages.php, ported from:
 *  pages/Pages_model, faq/Faq_model, news/News_model, testimonials/Testimonial_model, broucher/Broucher_model,
 *  image_gallery/Image_gallery_model, video_gallery/Video_gallery_model, users/Users_model::is_subscribed,
 *  MY_Model::findCount and the dbquery helpers.
 * Request input that the PHP models read themselves (keyword, sort_by, language_id) is read here from `ci`.
 */
const { sql } = require('drizzle-orm');
const { fetchAll, fetchRow, customResultSet, safeInsert, safeUpdate, countRecord } = require('./common.model');
const { ciWhere } = require('./pages.products.model');
const { wlTestimonials, wlInviteFriends, wlNewsletters, wlEnquiry } = require('../schema');
const { str, trim, toBool } = require('../utils/php');

/** mysqli::real_escape_string() — PHP escaped some values before handing them to like(), which escapes again. */
function escapeStr(s) {
  return str(s).replace(/[\0\n\r\\'"\x1a]/g, (c) => ({ '\0': '\\0', '\n': '\\n', '\r': '\\r', '\x1a': '\\Z' })[c] || `\\${c}`);
}

/** The value CodeIgniter's like() matched: escape_like_str() of the (already escape_str()'d) keyword. */
function ciLikeValue(escapedKeyword) {
  return `%${str(escapedKeyword).replace(/[!%_]/g, '!$&')}%`;
}

/* ------------------------------------------------------------------ CMS */

/** Pages_model::get_cms_page($page): row_array for { col: value } conditions, null otherwise. */
async function getCmsPage(db, page) {
  if (!page || typeof page !== 'object' || Object.keys(page).length === 0) return null;
  const conds = Object.entries(page).map(([k, v]) => sql`${sql.raw(`\`${k}\``)} = ${str(v)}`);
  return fetchRow(db, sql`SELECT * FROM wl_cms_pages WHERE ${sql.join(conds, sql` AND `)}`);
}

/** Pages::services() */
function getServicePages(db) {
  return fetchAll(db, sql`select * from wl_cms_pages where status='1' AND page_id IN (17,11,9,7) `);
}

/* ------------------------------------------------------------------ FAQ */

/** Faq_model::get_faq('', 0, { status }) — no limit. */
function getFaq(ci, { status } = {}) {
  const keyword = escapeStr(trim(ci.input.getPost('keyword', true)));
  const parts = [];
  if (str(status) !== '') parts.push({ type: 'AND', cond: sql`status = ${str(status)}` });
  if (keyword !== '') parts.push({ type: 'AND', cond: sql`faq_question LIKE ${ciLikeValue(keyword)} ESCAPE '!'` });
  return fetchAll(ci.db, sql`SELECT SQL_CALC_FOUND_ROWS* FROM wl_faqs${ciWhere(parts)} ORDER BY sort_order, faq_id DESC`);
}

/* ----------------------------------------------------------------- News */

/**
 * News_model::get_news($limit, $offset, $param) — param: { status, where (sql fragment) }.
 * Request input: keyword (or_like on news_title), sort_by. Returns rows, or the first row/null when limit == 1.
 */
async function getNews(ci, limit, offset, { status, where } = {}) {
  const keyword = escapeStr(trim(ci.input.getPost('keyword', true)));
  const parts = [];
  if (where) parts.push({ type: 'AND', cond: where });
  if (str(status) !== '') parts.push({ type: 'AND', cond: sql`wlp.status = ${str(status)}` });
  if (keyword !== '') parts.push({ type: parts.length ? 'OR' : 'AND', cond: sql`wlp.news_title LIKE ${ciLikeValue(keyword)} ESCAPE '!'` });
  parts.push({ type: 'AND', cond: sql`wlp.status != '2'` });

  const sortBy = trim(ci.input.getPost('sort_by', true));
  let order = sql`wlp.news_id DESC`;
  if (sortBy !== '') order = sortBy === 'az' ? sql`wlp.news_title ASC` : sql`wlp.news_title DESC`;
  const limitSql = str(limit) !== '' ? sql` LIMIT ${Number(offset) || 0}, ${Number(limit)}` : sql``;
  const rows = await fetchAll(
    ci.db,
    sql`SELECT SQL_CALC_FOUND_ROWS wlp.*,wlpm.media,wlpm.media_type,wlpm.is_default FROM wl_news as wlp LEFT JOIN wl_news_media AS wlpm ON wlp.news_id=wlpm.products_id${ciWhere(parts)} GROUP BY wlp.news_id ORDER BY ${order}${limitSql}`,
  );
  if (str(limit) === '1') return rows.length ? rows[0] : null;
  return rows;
}

/** News_model::get_news_media(5, 0, { productid }) */
function getNewsMedia(db, productId, limit = 5) {
  return fetchAll(db, sql`SELECT SQL_CALC_FOUND_ROWS * FROM wl_news_media WHERE products_id = ${str(productId)} ORDER BY id ASC LIMIT ${limit}`);
}

/* ---------------------------------------------------------- Testimonials */

/** Testimonial_model::get_testimonial($limit, 0, { status, where }) — always an array of rows. */
function getTestimonial(ci, limit, { status, where } = {}) {
  const keyword = escapeStr(trim(ci.input.getPost('keyword', true)));
  const parts = [];
  if (str(status) !== '') parts.push({ type: 'AND', cond: sql`status = ${str(status)}` });
  if (where) parts.push({ type: 'AND', cond: where });
  if (keyword !== '') {
    const kw = `%${trim(ci.input.getPost('keyword', true))}%`;
    parts.push({ type: 'AND', cond: sql`(poster_name LIKE ${kw} OR email LIKE ${kw} OR testimonial_title LIKE ${kw} )` });
  }
  const limitSql = str(limit) !== '' ? sql` LIMIT ${Number(limit)}` : sql``;
  return fetchAll(ci.db, sql`SELECT SQL_CALC_FOUND_ROWS* FROM wl_testimonials${ciWhere(parts)} ORDER BY testimonial_id DESC${limitSql}`);
}

/** MY_Model::safe_insert('wl_testimonials', ...) */
function insertTestimonial(db, data) {
  return safeInsert(db, wlTestimonials, data);
}

/** safe_update('wl_testimonials', { friendly_url }, "testimonial_id = '<id>'") */
function updateTestimonialUrl(db, testimonialId, friendlyUrl) {
  return safeUpdate(db, wlTestimonials, { friendly_url: friendlyUrl }, { testimonial_id: str(testimonialId) });
}

/* --------------------------------------------------------------- Others */

/** Broucher_model::get_brouchers({ status }, 0, '') */
function getBrouchers(db, { status } = {}) {
  const parts = [];
  if (str(status) !== '') parts.push({ type: 'AND', cond: sql`status = ${str(status)}` });
  return fetchAll(db, sql`SELECT SQL_CALC_FOUND_ROWS * FROM wl_brouchers${ciWhere(parts)} ORDER BY broucher_name ASC`);
}

/**
 * Image_gallery_model::get_image_gallery / Video_gallery_model::get_video_gallery('', 0, { status, type }) —
 * both read wl_gallery with the request's language_id and keyword filters.
 */
function getGallery(ci, { status, type } = {}) {
  const keyword = escapeStr(ci.input.getPost('keyword', true));
  const languageId = ci.input.getPost('language_id');
  const parts = [];
  if (toBool(languageId)) parts.push({ type: 'AND', cond: sql`language_id = ${str(languageId)}` });
  if (str(status) !== '') parts.push({ type: 'AND', cond: sql`status = ${str(status)}` });
  if (str(type) !== '') parts.push({ type: 'AND', cond: sql`type = ${str(type)}` });
  if (keyword !== '') parts.push({ type: 'AND', cond: sql`(title LIKE ${`%${str(ci.input.getPost('keyword', true))}%`} )` });
  return fetchAll(ci.db, sql`SELECT SQL_CALC_FOUND_ROWS* FROM wl_gallery${ciWhere(parts)} ORDER BY id DESC`);
}

/** get_db_field_value('wl_products', 'friendly_url', " AND products_id='<id>'") */
async function getProductFriendlyUrl(db, productId) {
  const row = await fetchRow(db, sql`SELECT friendly_url FROM wl_products WHERE 1 AND products_id=${str(productId)}`);
  return row ? row.friendly_url : null;
}

/** MY_Model::findCount('wl_invite_friends', "your_email ='<a>' AND friend_email ='<b>' ") */
function countInvites(db, yourEmail, friendEmail) {
  return countRecord(db, 'wl_invite_friends', sql`your_email =${str(yourEmail)} AND friend_email =${str(friendEmail)} `);
}

function insertInvite(db, data) {
  return safeInsert(db, wlInviteFriends, data);
}

/** Users_model::is_subscribed({ subscriber_email }) — TRUE only when exactly one non-deleted row matches. */
async function isSubscribed(db, email) {
  const rows = await fetchAll(db, sql`SELECT subscriber_id FROM wl_newsletters WHERE subscriber_email = ${str(email)} AND status != '2'`);
  return rows.length === 1;
}

function insertNewsletter(db, data) {
  return safeInsert(db, wlNewsletters, data);
}

function insertEnquiry(db, data) {
  return safeInsert(db, wlEnquiry, data);
}

/** Pages::update_keys(): api_access lookup / update / insert. */
function findApiAccess(db, deviceId) {
  return fetchRow(db, sql`SELECT id FROM api_access WHERE device_id = ${str(deviceId)}`);
}
function updateApiAccess(db, deviceId, keys) {
  return db.execute(sql`UPDATE api_access SET accesskey = ${str(keys)} WHERE device_id = ${str(deviceId)}`);
}
function insertApiAccess(db, deviceId, keys) {
  return db.execute(sql`INSERT INTO api_access (device_id, accesskey) VALUES (${str(deviceId)}, ${str(keys)})`);
}

/* ------------------------------------------------- custom_result_set() reads */

function getBanners(db, position) {
  return customResultSet(
    db,
    sql`SELECT banner_id,banner_image,banner_position,banner_url FROM wl_banners WHERE status='1' AND banner_position=${position} ORDER BY banner_id ASC `,
  );
}

function getCities(db) {
  return customResultSet(db, sql`SELECT * FROM wl_cities WHERE status='1' ORDER BY title asc `);
}

/** $this->language_id is undefined on the API controller, so PHP always compared language_id = ''. */
function getLocations(db, cityId, languageId) {
  return customResultSet(
    db,
    sql`SELECT wl.location_id, wll.title FROM wl_localities as wl INNER JOIN wl_localities_lang as wll ON wl.location_id=wll.location_id WHERE wl.status='1' and wl.city_id =${String(cityId)} and wll.language_id=${str(languageId)} ORDER BY wll.title asc `,
  );
}

function getSlots(db, languageId) {
  return customResultSet(
    db,
    sql`SELECT ws.slot_id, wsl.slot_name FROM wl_slots as ws INNER JOIN wl_slots_lang as wsl ON ws.slot_id=wsl.slot_id WHERE ws.status='1' AND wsl.language_id = ${str(languageId)} ORDER BY wsl.slot_name asc `,
  );
}

function getReasons(db, languageId) {
  return customResultSet(
    db,
    sql`SELECT ws.reason_id, wsl.reason_name FROM wl_reasons as ws INNER JOIN wl_reasons_lang as wsl ON ws.reason_id=wsl.reason_id WHERE ws.status='1' AND wsl.language_id = ${str(languageId)} ORDER BY wsl.reason_name asc `,
  );
}

/** search_list() category query (wl_categories_lang). */
function searchCategories(db, keyword, languageId) {
  const cond = keyword !== '' ? sql` AND wcl.category_name like ${`%${keyword}%`} ` : sql``;
  return customResultSet(
    db,
    sql`SELECT wc.category_id, wc.category_image, wcl.category_name, wc.friendly_url, wc.parent_id FROM wl_categories as wc INNER JOIN wl_categories_lang as wcl ON wc.category_id=wcl.category_id WHERE wc.status='1' AND wcl.language_id = ${str(languageId)} ${cond}ORDER BY RAND() LIMIT 50 `,
  );
}

module.exports = {
  escapeStr,
  getCmsPage,
  getServicePages,
  getFaq,
  getNews,
  getNewsMedia,
  getTestimonial,
  insertTestimonial,
  updateTestimonialUrl,
  getBrouchers,
  getGallery,
  getProductFriendlyUrl,
  countInvites,
  insertInvite,
  isSubscribed,
  insertNewsletter,
  insertEnquiry,
  findApiAccess,
  updateApiAccess,
  insertApiAccess,
  getBanners,
  getCities,
  getLocations,
  getSlots,
  getReasons,
  searchCategories,
};
