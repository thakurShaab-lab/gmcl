const mysql = require('mysql2/promise');
const { drizzle } = require('drizzle-orm/mysql2');
const env = require('./env');
const schema = require('../schema');

// mysqli (used by the PHP app) returns every column as a string (or NULL). Keep that exactly so that
// API responses carry the same value types the PHP API produced.
function typeCast(field, next) {
  if (field.type === 'BLOB' || field.type === 'TINY_BLOB' || field.type === 'MEDIUM_BLOB' || field.type === 'LONG_BLOB') {
    return field.string('utf8');
  }
  return field.string();
}

const pool = mysql.createPool({
  host: env.db.host,
  port: env.db.port,
  user: env.db.user,
  password: env.db.password,
  database: env.db.database,
  connectionLimit: env.db.connectionLimit,
  charset: 'UTF8_GENERAL_CI',
  dateStrings: true,
  supportBigNumbers: true,
  bigNumberStrings: true,
  decimalNumbers: false,
  multipleStatements: false,
  typeCast,
});

/**
 * Drizzle passes its own typeCast on every query (numbers for INT/FLOAT columns). Force the mysqli-style
 * cast instead, so `db.execute(query)` returns rows keyed by column name with string values.
 */
function withPhpTypes(conn) {
  return new Proxy(conn, {
    get(target, prop) {
      if (prop === 'query') {
        return (opts, values) => target.query(typeof opts === 'object' ? { ...opts, typeCast } : { sql: opts, typeCast }, values);
      }
      const value = target[prop];
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
}

/**
 * PHP used one MySQL connection per request. Several queries depend on that
 * (SQL_CALC_FOUND_ROWS + FOUND_ROWS(), LAST_INSERT_ID()), so every request gets its own
 * dedicated connection wrapped in a Drizzle instance.
 */
async function acquire() {
  const conn = await pool.getConnection();
  return { conn, db: drizzle(withPhpTypes(conn), { schema, mode: 'default' }) };
}

/** Startup check: opens one connection, pings MySQL and logs the result. Resolves to true/false. */
async function checkConnection() {
  const target = `${env.db.host}:${env.db.port}/${env.db.database}`;
  try {
    const conn = await pool.getConnection();
    await conn.ping();
    conn.release();
    console.log(`Database connected (${target})`);
    return true;
  } catch (err) {
    console.error(`Database connection failed (${target}): ${err.code || ''} ${err.message}`.trim());
    return false;
  }
}

module.exports = { pool, acquire, checkConnection };
