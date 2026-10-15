/**
 * Queries from modules/products/models/Product_model.php (and the product_helper.php / dbquery_helper.php calls
 * made by modules/api/controllers/Products.php).
 *
 * Product_model::get_products() was a CodeIgniter query-builder query whose WHERE/ORDER BY parts partly came from
 * the request. Request values are always bound as parameters here; SQL text only ever comes from code.
 */
const fs = require('fs');
const path = require('path');
const { sql } = require('drizzle-orm');
const env = require('../config/env');
const { fetchAll, fetchRow } = require('./common.model');
const { str, intval, empty, neq, isNumeric, trim, toBool } = require('../utils/php');

/* ------------------------------------------------------------------ SQL text builder */

/**
 * A WHERE fragment built like the PHP string concatenations ($where .= "..."): code text and bound values.
 * chop(n) is PHP's substr($where, 0, -n) — it only ever removes trailing code text.
 */
class SqlText {
  constructor(raw = '') {
    this.parts = raw === '' ? [] : [{ raw }];
  }

  raw(text) {
    this.parts.push({ raw: text });
    return this;
  }

  param(value) {
    this.parts.push({ param: value });
    return this;
  }

  chop(n) {
    while (n > 0 && this.parts.length) {
      const last = this.parts[this.parts.length - 1];
      if (!('raw' in last)) throw new Error('SqlText.chop() reached a bound value');
      if (last.raw.length <= n) {
        n -= last.raw.length;
        this.parts.pop();
      } else {
        last.raw = last.raw.slice(0, last.raw.length - n);
        n = 0;
      }
    }
    return this;
  }

  isEmpty() {
    return this.parts.length === 0;
  }

  toSql() {
    return sql.join(
      this.parts.map((p) => ('raw' in p ? sql.raw(p.raw) : sql`${p.param}`)),
      sql``,
    );
  }
}

/** CI select(): the field list is split on commas, trimmed, empty items dropped and re-joined with ", ". */
function ciSelect(text) {
  return text
    .split(',')
    .map((v) => v.trim())
    .filter((v) => v !== '')
    .join(', ');
}

/** `a` / `a.b` identifiers escaped like CI protect_identifiers() (request text is never emitted raw). */
function identifier(name) {
  return sql.join(
    String(name)
      .split('.')
      .map((part) => sql.identifier(part)),
    sql`.`,
  );
}

/**
 * A comma separated id list that PHP interpolated raw into "IN (...)". Numbers are bound as numbers, quoted
 * literals as strings, column-like words as escaped identifiers (MySQL then fails exactly like PHP did with
 * "Unknown column"), empty items stay empty (a syntax error, as in PHP).
 */
function inList(value) {
  const items = str(value)
    .split(',')
    .map((piece) => {
      const p = trim(piece);
      if (p === '') return sql.raw('');
      if (isNumeric(p)) return sql`${Number(p)}`;
      const quoted = p.match(/^'([^']*)'$/) || p.match(/^"([^"]*)"$/);
      if (quoted) return sql`${quoted[1]}`;
      return identifier(p);
    });
  return sql.join(items, sql`,`);
}

/**
 * ORDER BY of a CI order_by($orderby, $direction) call. PHP protected plain identifiers and passed function calls
 * through untouched; only RAND() is supported as a function here, anything else is emitted as an escaped
 * identifier.
 */
function orderTerms(orderby, direction = '') {
  direction = str(direction).trim().toUpperCase();
  if (direction !== '') direction = ['ASC', 'DESC'].includes(direction) ? ` ${direction}` : '';
  return str(orderby)
    .split(',')
    .map((field) => {
      let dir = direction;
      let f = field.trim();
      if (direction === '') {
        const m = field.replace(/\s+$/, '').match(/\s+(ASC|DESC)$/i);
        if (m) {
          f = field.replace(/\s+$/, '').slice(0, m.index).replace(/^\s+/, '');
          dir = ` ${m[1]}`;
        }
      }
      const fieldSql = /^RAND\(\)$/i.test(f) ? sql.raw('RAND()') : identifier(f);
      return sql`${fieldSql}${sql.raw(dir)}`;
    });
}

/** CI limit($value, $offset) + _limit(): '' / 0 means no LIMIT. */
function limitSql(limit, offset) {
  if (limit === '' || limit === null || limit === undefined) return sql``;
  const lim = intval(limit);
  if (!lim) return sql``;
  const off = empty(offset) ? 0 : intval(offset);
  return off ? sql` LIMIT ${off}, ${lim}` : sql` LIMIT ${lim}`;
}

/* ------------------------------------------------------------------ get_products */

const PRODUCT_SELECT_TAIL =
  ",wlp.status as product_status,wlpm.media,wlpm.media_type,wlpm.is_default,(SELECT count(review_id) FROM wl_review WHERE entity_id=wlp.products_id AND rev_type = 'P' AND status = '1' ) AS review_count, IF(wlstock.product_discounted_price = 0,wlstock.product_price, wlstock.product_discounted_price ) as price, wlstock.product_price, wlstock.product_discounted_price, ( SELECT bnd.brand_name FROM wl_brands AS bnd WHERE wlp.brand_id=bnd.brand_id ) AS brand_name, IF(wlw.wishlists_id is null,0,1) as wishlist, wlw.wishlists_id";

/**
 * Product_model::get_products($limit, $offset, $param, $fields = 'wlp.*').
 * param: { wish_user_id, category_id, brand_id, color_id, size_id, size_ids, color_ids, status, productid,
 *          orderby, orderbyn, where (SqlText | string of code SQL) }
 * Also reads the request: keyword2, search_prod_type, sortby. Returns the first row (or null) when $limit == '1',
 * otherwise all rows.
 */
async function getProducts(ci, limit = '10', offset = '0', param = {}, fields = 'wlp.*') {
  const wishUserId = intval(param.wish_user_id);
  const categoryId = param.category_id ?? null;
  const brandId = param.brand_id ?? null;
  const colorId = param.color_id ?? null;
  const sizeId = param.size_id ?? null;
  const sizeIds = param.size_ids ?? null;
  const colorIds = param.color_ids ?? null;
  const status = param.status ?? null;
  const productId = param.productid ?? null;
  let orderby = param.orderby ?? null;
  const orderbyn = param.orderbyn ?? null;
  const where = param.where ?? null;
  const keyword = trim(ci.input.getPost('keyword2', true));

  const wheres = [];
  if (where instanceof SqlText ? !where.isEmpty() : neq(where, '')) {
    wheres.push(where instanceof SqlText ? where.toSql() : sql.raw(where));
  }
  if (neq(categoryId, '') && intval(categoryId) > 0) {
    wheres.push(sql`FIND_IN_SET( ${str(categoryId)},wlp.category_links )`);
  }
  if (neq(productId, '')) wheres.push(sql`wlp.products_id = ${str(productId)}`);
  if (neq(brandId, '')) wheres.push(sql`wlp.brand_id = ${str(brandId)}`);
  if (neq(status, '')) wheres.push(sql`wlp.status = ${str(status)}`);
  const searchProdType = ci.input.getPost('search_prod_type', true);
  if (neq(searchProdType, '')) wheres.push(sql`${identifier(`wlp.${str(searchProdType)}`)} = '1'`);
  if (keyword !== '') {
    wheres.push(sql`(wlp.product_name LIKE ${`%${keyword}%`} OR wlp.product_code LIKE ${`%${keyword}%`} )`);
  }

  const sortby = ci.input.getPost('sortby');
  if (neq(sortby, '')) orderby = sortby;
  const orders = [];
  if (neq(orderby, '')) {
    const o = str(orderby);
    if (o === 'lth') orders.push(...orderTerms('price', 'asc'));
    if (o === 'htl') orders.push(...orderTerms('price', 'desc'));
    if (o === 'az') orders.push(...orderTerms('product_name', 'asc'));
    if (o === 'za') orders.push(...orderTerms('product_name', 'desc'));
  }
  const ob = str(orderby);
  if (ob !== 'lth' && ob !== 'htl' && ob !== 'az' && ob !== 'za' && !empty(orderby)) orders.push(...orderTerms(orderby));
  if (empty(orderby) && empty(orderbyn)) orders.push(sql`wlp.products_id DESC`);

  wheres.push(sql`wlp.status != '2'`);
  wheres.push(sql`wlstock.product_price > '0'`);

  const joins = [
    sql`LEFT JOIN wl_products_media AS wlpm ON wlp.products_id=wlpm.products_id AND wlpm.type="main"`,
    sql`INNER JOIN wl_product_stock AS wlstock ON wlp.products_id=wlstock.product_id`,
  ];
  if (neq(colorId, '')) joins.push(sql`JOIN wl_product_colors AS wlc ON wlp.products_id=wlc.product_id AND wlc.color_id=${inList(colorId)}`);
  if (neq(colorIds, '')) joins.push(sql`JOIN wl_product_colors AS wlc ON wlp.products_id=wlc.product_id AND wlc.color_id IN (${inList(colorIds)})`);
  if (neq(sizeId, '')) joins.push(sql`JOIN wl_product_sizes AS wls ON wlp.products_id=wls.product_id AND wls.size_id=${inList(sizeId)}`);
  if (neq(sizeIds, '')) joins.push(sql`JOIN wl_product_sizes AS wls ON wlp.products_id=wls.product_id AND wls.size_id IN (${inList(sizeIds)})`);
  joins.push(sql`LEFT JOIN wl_wishlists AS wlw ON wlp.products_id=wlw.product_id AND wlw.customer_id=${str(wishUserId)}`);

  const select = ciSelect(`SQL_CALC_FOUND_ROWS ${str(fields)}${PRODUCT_SELECT_TAIL}`);
  const query = sql`SELECT ${sql.raw(select)}
FROM wl_products as wlp
${sql.join(joins, sql`\n`)}
WHERE ${sql.join(wheres, sql`\nAND `)}
GROUP BY wlp.products_id
ORDER BY ${sql.join(orders, sql`, `)}${limitSql(limit, offset)}`;
  const rows = await fetchAll(ci.db, query);
  return str(limit) === '1' ? (rows.length ? rows[0] : null) : rows;
}

/* ------------------------------------------------------------------ related products */

/**
 * Product_model::related_products($productId, $start, $limit, $param): findAll('wl_products_related') in RAND()
 * order, then get_products(1, 0, productid = related_id) for each row; empty results are filtered out.
 * Returns { rows (array, re-indexed), total } — total is MY_Model::$total_rec_found (COUNT(*) of the relations).
 */
async function relatedProducts(ci, productId, start = 'NULL', limit = 'NULL', param = {}, { withTotal = false } = {}) {
  const wishUserId = intval(param.wish_user_id);
  const condition = neq(productId, '') ? sql`status ='1' AND product_id = ${str(productId)} ` : sql`status ='1'`;
  const lim = str(limit) !== 'NULL' ? limitSql(limit, start) : sql``;
  const relations = await fetchAll(ci.db, sql`SELECT * FROM wl_products_related WHERE ${condition} ORDER BY RAND()${lim}`);
  let total;
  if (withTotal) {
    const row = await fetchRow(ci.db, sql`SELECT COUNT(*) AS numrows FROM wl_products_related WHERE ${condition} LIMIT 1`);
    total = Number(row.numrows);
  }
  const rows = [];
  for (const rel of relations) {
    const product = await getProducts(ci, 1, 0, { productid: rel.related_id, wish_user_id: wishUserId });
    if (product) rows.push(product);
  }
  return { rows, total };
}

/* ------------------------------------------------------------------ product details */

/** Product_model::get_product_sizes($id) */
async function getProductSizes(db, id) {
  id = intval(id);
  if (!(id > 0)) return null;
  return fetchAll(
    db,
    sql`SELECT ws.size_id, ws.size_name FROM wl_product_sizes as wps JOIN wl_sizes as ws ON ws.size_id=wps.size_id JOIN wl_product_stock as wpst ON wpst.product_size=ws.size_id WHERE wps.product_id = ${id} GROUP BY wpst.product_size ORDER BY ws.size_name asc`,
  );
}

/** Product_model::get_product_colors($id) */
async function getProductColors(db, id) {
  id = intval(id);
  if (!(id > 0)) return null;
  return fetchAll(
    db,
    sql`SELECT wc.color_id, wc.color_name, wc.color_code, wpc.image FROM wl_product_colors as wpc LEFT JOIN wl_colors as wc ON wc.color_id=wpc.color_id LEFT JOIN wl_product_stock as wps ON wps.product_color=wpc.color_id WHERE wpc.product_id = ${id} GROUP BY wc.color_id ORDER BY wc.color_name asc`,
  );
}

/** Product_model::product_id_stock_list($product_id): rows, or false when there are none. */
async function productIdStockList(db, productId) {
  const rows = await fetchAll(db, sql`SELECT * FROM wl_product_stock WHERE product_id=${str(productId)}  ORDER BY product_size ASC`);
  return rows.length ? rows : false;
}

/** custom_result_set("SELECT id,products_id,media,is_default FROM wl_products_media ...") — rows or null. */
async function productMedia(db, productId) {
  const rows = await fetchAll(db, sql`SELECT id,products_id,media,is_default FROM wl_products_media WHERE products_id=${str(productId)} ORDER BY id asc`);
  return rows.length ? rows : null;
}

/** "SELECT media FROM wl_products_media WHERE products_id='x' order by id asc LIMIT 1" — rows (0 or 1). */
function firstMedia(db, productId) {
  return fetchAll(db, sql`SELECT media FROM wl_products_media WHERE products_id=${str(productId)} order by id asc LIMIT 1`);
}

/** file_exists(UPLOAD_DIR."/products/".$media) */
function productMediaExists(media) {
  return fs.existsSync(path.join(env.uploadDir, 'products', str(media)));
}

/**
 * Product_model::get_reviews($limit, $offset, $param) — also filters on the request's keyword (xss-cleaned).
 * param: { status, rev_status, entity_id, rev_type, orderby }
 */
async function getReviews(ci, limit = '10', offset = '0', param = {}) {
  const keyword = trim(ci.input.getPost('keyword', true));
  const wheres = [];
  if (neq(param.entity_id ?? null, '')) wheres.push(sql`prd.products_id = ${str(param.entity_id)}`);
  if (neq(param.rev_type ?? null, '')) wheres.push(sql`rev.rev_type = ${str(param.rev_type)}`);
  if (neq(param.rev_status ?? null, '')) wheres.push(sql`rev.status = ${str(param.rev_status)}`);
  if (neq(param.status ?? null, '')) wheres.push(sql`prd.status = ${str(param.status)}`);
  if (keyword !== '') {
    const like = `%${keyword}%`;
    wheres.push(sql`(prd.product_name LIKE ${like} OR rev.poster_name LIKE ${like} OR rev.email LIKE ${like} )`);
  }
  const whereSql = wheres.length ? sql` WHERE ${sql.join(wheres, sql` AND `)}` : sql``;
  const order = neq(param.orderby ?? null, '') ? sql.join(orderTerms(param.orderby), sql`, `) : sql`rev.review_id DESC`;
  return fetchAll(
    ci.db,
    sql`SELECT SQL_CALC_FOUND_ROWS rev.*,prd.product_name,prd.products_id FROM wl_review as rev LEFT JOIN wl_products AS prd ON rev.entity_id=prd.products_id${whereSql} ORDER BY ${order}${toBool(limit) ? limitSql(limit, offset) : sql``}`,
  );
}

module.exports = {
  SqlText,
  identifier,
  getProducts,
  relatedProducts,
  getProductSizes,
  getProductColors,
  productIdStockList,
  productMedia,
  firstMedia,
  productMediaExists,
  getReviews,
};
