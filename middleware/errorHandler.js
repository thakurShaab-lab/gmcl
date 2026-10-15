/**
 * Central error handling.
 *  - Database errors: CodeIgniter ran with db_debug = TRUE and answered with its "A Database Error Occurred"
 *    page (HTTP 500): error number, MySQL message and the failing SQL. PHP also printed the PHP file/line that
 *    ran the query, which has no equivalent here and is omitted.
 *  - Anything else (a bug in this service): HTTP 500 with the output buffered so far.
 */
const ciErrorPage = require('../utils/ciErrorPage');
const { str } = require('../utils/php');

/** The SQL text with parameters inlined the way CodeIgniter escaped them. */
function inlineSql(query, params = []) {
  let i = 0;
  return String(query || '').replace(/\?/g, () => {
    const v = params[i++];
    if (v === null || v === undefined) return 'NULL';
    if (typeof v === 'number') return String(v);
    if (typeof v === 'boolean') return v ? '1' : '0';
    return `'${str(v).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
  });
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  const dbError = err && err.cause && err.cause.sqlMessage ? err.cause : err && err.sqlMessage ? err : null;
  console.error(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`, dbError ? dbError.sqlMessage : err);
  if (res.headersSent) return;
  const out = req.ci && req.ci.out;
  if (dbError && out) {
    out.status = 500;
    out.exited = true;
    out.header('Content-type', 'text/html; charset=UTF-8');
    out.echo(
      ciErrorPage(
        'A Database Error Occurred',
        [`Error Number: ${dbError.errno}`, dbError.sqlMessage, inlineSql(err.query || dbError.sql, err.params)],
        'Database Error',
      ),
    );
    out.send({ cors: req.ci.cors !== false });
    return;
  }
  res.status(500);
  res.setHeader('Content-Type', 'text/html; charset=UTF-8');
  res.end(out ? out.body : '');
}

module.exports = errorHandler;
