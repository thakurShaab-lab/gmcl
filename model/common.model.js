/**
 * Shared query helpers — ports of apps/helpers/dbquery_helper.php and MY_Model's safe_* writers.
 *
 * Reads go through db.execute(), which returns rows keyed by database column name with string/null
 * values (exactly what mysqli gave PHP). Conditions are Drizzle `sql` fragments, e.g.
 *   sql` AND customers_id = ${str(id)} AND status = '1'`
 * or plain objects ({ column: value } => AND column = 'value').
 */
const { sql, getTableColumns, and, eq: dEq, ne, lt, lte, gt, gte, isNull, isNotNull } = require('drizzle-orm');
const { getTableConfig } = require('drizzle-orm/mysql-core');
const { str } = require('../utils/php');

/** `column AS alias` inside a Drizzle select (plain columns are never aliased by Drizzle). */
const alias = (column, name) => sql`${column}`.as(name);

/** Rows of any Drizzle query (builder or sql``). */
async function fetchAll(db, query) {
  const [rows] = await db.execute(query);
  return rows;
}

/** First row or null ($query->row_array() / ->row()). */
async function fetchRow(db, query) {
  const rows = await fetchAll(db, query);
  return rows.length ? rows[0] : null;
}

/** Turns an object or sql fragment into " AND ..." text appended after "WHERE 1". */
function conditionSql(condition) {
  if (condition === undefined || condition === null || condition === '') return sql``;
  if (typeof condition === 'string') return sql.raw(condition); // only for literal SQL written in code
  if (condition && typeof condition.getSQL === 'function') return condition;
  const parts = Object.entries(condition).map(([k, v]) => sql` AND ${sql.raw(k)}=${str(v)}`);
  return sql.join(parts, sql``);
}

/** get_db_field_value($table, $field, $condition): the value, or null when no row matched. */
async function getDbFieldValue(db, table, field, condition) {
  const row = await fetchRow(db, sql`SELECT ${sql.raw(field)} FROM ${sql.raw(table)} WHERE 1${conditionSql(condition)}`);
  if (!row) return null;
  return row[field] === undefined ? null : row[field];
}

/**
 * get_db_single_row($table, $fields, $condition): the row, or null when there is no row. When more than one
 * row matches, PHP echoed a debug message (written to `out` if given) and returned NULL.
 */
async function getDbSingleRow(db, table, fields = '*', condition = '', out = null) {
  const query = sql`SELECT ${sql.raw(fields)} FROM ${sql.raw(table)} WHERE 1${conditionSql(condition)}`;
  const rows = await fetchAll(db, query);
  if (rows.length > 1) {
    if (out) out.echo('Query returns multiple result set please check : ', echoSql(db, query));
    return null;
  }
  return rows.length ? rows[0] : null;
}

/** echo_sql(): the last query, word-wrapped in a red <font> block. */
function echoSql(db, query) {
  const { sql: text, params } = db.dialect.sqlToQuery(query.getSQL ? query.getSQL() : query);
  let i = 0;
  const q = text.replace(/\?/g, () => `'${str(params[i++]).replace(/'/g, "\\'")}'`);
  return `<font color='#ff0000' style='font-size:16px;font-family:verdana'><br />${wordwrap(q, 60, '<br />\n', true)}<br />\n </font>`;
}

/** PHP wordwrap() */
function wordwrap(text, width, brk, cut) {
  const words = text.split(' ');
  const lines = [];
  let line = '';
  for (let word of words) {
    while (cut && word.length > width) {
      if (line) {
        lines.push(line);
        line = '';
      }
      lines.push(word.slice(0, width));
      word = word.slice(width);
    }
    if (line === '') line = word;
    else if (line.length + 1 + word.length <= width) line += ` ${word}`;
    else {
      lines.push(line);
      line = word;
    }
  }
  lines.push(line);
  return lines.join(brk);
}

/** count_record($table, $condition): COUNT(*) as an integer. */
async function countRecord(db, table, condition = '') {
  const where = condition === '' || condition === null || condition === undefined ? sql`` : sql` WHERE ${conditionText(condition)}`;
  const row = await fetchRow(db, sql`SELECT COUNT(*) AS numrows FROM ${sql.raw(table)}${where}`);
  return Number(row.numrows);
}

function conditionText(condition) {
  if (typeof condition === 'string') return sql.raw(condition);
  if (condition && typeof condition.getSQL === 'function') return condition;
  return sql.join(Object.entries(condition).map(([k, v]) => sql`${sql.raw(k)} = ${str(v)}`), sql` AND `);
}

/** custom_result_set($sql): rows, or null when nothing matched. */
async function customResultSet(db, query) {
  const rows = await fetchAll(db, query);
  return rows.length ? rows : null;
}

/** get_found_rows(): FOUND_ROWS() as returned by mysqli (a string). Must run on the same connection. */
async function getFoundRows(db) {
  const row = await fetchRow(db, sql`SELECT FOUND_ROWS() AS total`);
  return row.total;
}

/** get_auto_increment($table) */
async function getAutoIncrement(db, table) {
  const rows = await fetchAll(db, sql`SHOW TABLE STATUS LIKE ${table}`);
  return rows.length === 1 ? rows[0].Auto_increment : null;
}

/**
 * MY_Model::findAll($table, $params): SELECT <field> FROM <table> WHERE <condition> ORDER BY <order>
 * LIMIT <start>, <limit>. Returns { rows, total } where rows is null when nothing matched (PHP returned
 * NULL) and total is MY_Model::$total_rec_found (an integer COUNT(*) over the same condition).
 * `table`, `field` and `order` are SQL written in code; `condition` is a Drizzle sql fragment.
 */
async function findAll(db, table, { field = '*', condition = null, order = null, start = 0, limit = null } = {}) {
  const where = condition ? sql` WHERE ${condition}` : sql``;
  const orderBy = order ? sql` ORDER BY ${sql.raw(order)}` : sql``;
  const limitSql = limit !== null && limit !== undefined ? sql` LIMIT ${Number(start) || 0}, ${Number(limit)}` : sql``;
  const rows = await fetchAll(db, sql`SELECT ${sql.raw(field)} FROM ${sql.raw(table)}${where}${orderBy}${limitSql}`);
  const countRow = await fetchRow(db, sql`SELECT COUNT(*) AS numrows FROM ${sql.raw(table)}${where}`);
  return { rows: rows.length ? rows : null, total: Number(countRow.numrows) };
}

/* --------------------------------------------------------------- writes */

/**
 * CodeIgniter's escape() for insert_string()/update_string(): NULL, booleans as 1/0, numbers unquoted,
 * everything else as a quoted string (Buffers stay binary).
 */
function ciValue(v) {
  if (v === null || v === undefined) return null;
  if (v === true) return 1;
  if (v === false) return 0;
  if (typeof v === 'number' || Buffer.isBuffer(v)) return v;
  return str(v);
}

/** The Drizzle table for a table name ("wl_customers"), or null when the schema has no such table. */
function schemaTable(name) {
  const schema = require('../schema'); // eslint-disable-line global-require
  return Object.values(schema).find((t) => getTableConfig(t).name === name) || null;
}

/**
 * Resolves `table` (a Drizzle table or a table name) for a write. Returns { table, name, raw } where raw = true
 * means the write must be sent as plain SQL so MySQL reports what PHP reported: a table that is not in the
 * schema, or a column that does not exist ("Unknown column ..." — some PHP writes name such columns).
 */
function writeTarget(table, data) {
  const tbl = typeof table === 'string' ? schemaTable(table) : table;
  const name = typeof table === 'string' ? table : getTableConfig(table).name;
  if (!tbl) return { table: null, name, raw: true };
  const names = new Set(Object.values(getTableColumns(tbl)).map((c) => c.name));
  return { table: tbl, name, raw: Object.keys(data || {}).some((k) => !names.has(k)) };
}

/** Maps { db_column: value } to the table's Drizzle keys. */
function toColumns(table, data) {
  const byName = {};
  for (const [key, col] of Object.entries(getTableColumns(table))) byName[col.name] = key;
  const out = {};
  for (const [name, value] of Object.entries(data)) {
    const key = byName[name];
    if (!key) throw new Error(`Unknown column '${name}' in '${getTableConfig(table).name}'`);
    out[key] = ciValue(value);
  }
  return out;
}

/** WHERE for CodeIgniter where-arrays ({ col: v, 'col!=': v, col: null => IS NULL }) as plain SQL. */
function rawWhere(where) {
  if (where && typeof where.getSQL === 'function') return where;
  if (typeof where === 'string') return sql.raw(where);
  return sql.join(
    Object.entries(where).map(([rawKey, value]) => {
      const m = rawKey.trim().match(/^`?([\w.]+)`?\s*(!=|<>|<=|>=|<|>|=)?$/);
      const op = m[2] || '=';
      if (value === null || value === undefined) return sql`${sql.identifier(m[1])} ${sql.raw(op === '=' ? 'IS NULL' : 'IS NOT NULL')}`;
      return sql`${sql.identifier(m[1])} ${sql.raw(op)} ${ciValue(value)}`;
    }),
    sql` AND `,
  );
}

/** CodeIgniter where-array semantics on a Drizzle table. */
function whereFromObject(table, where) {
  if (where && typeof where.getSQL === 'function') return where;
  if (typeof where === 'string') return sql.raw(where);
  const byName = {};
  for (const col of Object.values(getTableColumns(table))) byName[col.name] = col;
  const parts = Object.entries(where).map(([rawKey, value]) => {
    const m = rawKey.trim().match(/^`?([\w.]+)`?\s*(!=|<>|<=|>=|<|>|=)?$/);
    const col = byName[m[1].split('.').pop()];
    if (!col) return rawWhere({ [rawKey]: value }); // unknown column: let MySQL report it
    const op = m[2] || '=';
    if (value === null || value === undefined) return op === '=' ? isNull(col) : isNotNull(col);
    return { '=': dEq, '!=': ne, '<>': ne, '<': lt, '<=': lte, '>': gt, '>=': gte }[op](col, ciValue(value));
  });
  return parts.length === 1 ? parts[0] : and(...parts);
}

/** safe_insert($table, $data): returns the insert id (integer). `table`: Drizzle table or table name. */
async function safeInsert(db, table, data) {
  if (!data || Object.keys(data).length === 0) return null;
  const t = writeTarget(table, data);
  if (t.raw) {
    const cols = sql.join(Object.keys(data).map((c) => sql.identifier(c)), sql`, `);
    const vals = sql.join(Object.values(data).map((v) => sql`${ciValue(v)}`), sql`, `);
    const [raw] = await db.execute(sql`INSERT INTO ${sql.identifier(t.name)} (${cols}) VALUES (${vals})`);
    return raw.insertId;
  }
  const [result] = await db.insert(t.table).values(toColumns(t.table, data));
  return result.insertId;
}

/** safe_update($table, $data, $where). `table`: Drizzle table or table name. */
async function safeUpdate(db, table, data, where) {
  if (!data || Object.keys(data).length === 0 || !where) return undefined;
  const t = writeTarget(table, data);
  if (t.raw) {
    const sets = sql.join(Object.entries(data).map(([c, v]) => sql`${sql.identifier(c)} = ${ciValue(v)}`), sql`, `);
    const [raw] = await db.execute(sql`UPDATE ${sql.identifier(t.name)} SET ${sets} WHERE ${t.table ? whereFromObject(t.table, where) : rawWhere(where)}`);
    return raw;
  }
  const [result] = await db.update(t.table).set(toColumns(t.table, data)).where(whereFromObject(t.table, where));
  return result;
}

/** safe_delete($table, $where). `table`: Drizzle table or table name. */
async function safeDelete(db, table, where) {
  if (!where || (typeof where === 'object' && !where.getSQL && Object.keys(where).length === 0)) return undefined;
  const t = writeTarget(table, {});
  if (t.raw) {
    const [raw] = await db.execute(sql`DELETE FROM ${sql.identifier(t.name)} WHERE ${rawWhere(where)}`);
    return raw;
  }
  const [result] = await db.delete(t.table).where(whereFromObject(t.table, where));
  return result;
}

module.exports = {
  alias,
  fetchAll,
  fetchRow,
  conditionSql,
  getDbFieldValue,
  getDbSingleRow,
  countRecord,
  customResultSet,
  getFoundRows,
  getAutoIncrement,
  findAll,
  safeInsert,
  safeUpdate,
  safeDelete,
  toColumns,
  whereFromObject,
  rawWhere,
  ciValue,
};
