/**
 * PHP output buffer for one request: echo/print append to the body, and the response is sent once the
 * controller finishes (or "exits"). Headers mirror what PHP/CodeIgniter emitted.
 */
const { str } = require('./php');
const { myJsonEncode } = require('./phpJson');
const ciErrorPage = require('./ciErrorPage');

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS, PUT, DELETE',
  'Access-Control-Allow-Headers': 'authorization',
};

/** Thrown to stop the request the way PHP's exit/die did; the route wrapper sends the buffered output. */
class PhpExit extends Error {
  constructor() {
    super('exit');
    this.name = 'PhpExit';
  }
}

class Output {
  /** prefix: bytes printed before the controller ran (the api module's config file emits one space). */
  constructor(res, prefix = '') {
    this.res = res;
    this.body = prefix;
    this.status = 200;
    this.headers = {};
    this.exited = false;
  }

  /** echo / print */
  echo(...values) {
    for (const v of values) this.body += str(v);
  }

  /** header('Name: value') */
  header(name, value) {
    this.headers[name] = value;
  }

  /** my_json_encode(): returns the JSON text and sets the JSON content type, exactly like the helper. */
  myJsonEncode(data, stripTag = 'true') {
    this.header('Content-Type', 'application/json');
    return myJsonEncode(data, stripTag);
  }

  /** print(my_json_encode($data)) — the response pattern used by almost every API method. */
  json(data, stripTag = 'true') {
    this.echo(this.myJsonEncode(data, stripTag));
  }

  /** exit / die: stops the request immediately (throws PhpExit). CodeIgniter's output headers are not applied. */
  exit(message) {
    if (message !== undefined) this.echo(message);
    this.exited = true;
    throw new PhpExit();
  }

  /** show_error(): CodeIgniter's error page with HTTP 500 (used where PHP fails to load a missing file). */
  showError(message, heading = 'An Error Was Encountered') {
    this.status = 500;
    this.header('Content-type', 'text/html; charset=UTF-8');
    this.echo(ciErrorPage(heading, `${message}`));
    this.exited = true;
    throw new PhpExit();
  }

  /**
   * A displayed PHP warning/notice (PHP 5.6 + CodeIgniter's error_php view, echoed inline; execution continues).
   * file: last two path segments as CI prints them, e.g. 'controllers/User.php'.
   * frames: debug_backtrace() rows rendered by the view; `null` = a frame CI hides (system/no file),
   * { file, line, fn } = a shown frame with a path relative to the PHP document root.
   * The default matches a warning raised directly inside a controller method (verified on PHP 5.6).
   * path: source path relative to the document root when the file is not under modules/api/ (e.g. 'apps/core/MY_Controller.php').
   */
  phpWarning(message, file, line, { severity = 'Warning', frames, path } = {}) {
    const docroot = process.env.PHP_DOCROOT || '/home/gmcljain/public_html/';
    const controllerFile = path || `modules/api/${file}`;
    const rows = frames || [null, null, { file: controllerFile, line, fn: '_error_handler' }, null, null, { file: 'index.php', line: 304, fn: 'require_once' }];
    let trace = '';
    for (const f of rows) {
      trace += '\r\n\t\t';
      if (f) trace += `\r\n\t\t\t<p style="margin-left:10px">\r\n\t\t\tFile: ${docroot}${f.file}<br />\r\n\t\t\tLine: ${f.line}<br />\r\n\t\t\tFunction: ${f.fn}\t\t\t</p>\r\n\r\n\t\t`;
      trace += '\r\n\t';
    }
    this.echo(
      '\r\n<div style="border:1px solid #990000;padding-left:20px;margin:0 0 10px 0;">\r\n\r\n' +
        '<h4>A PHP Error was encountered</h4>\r\n\r\n' +
        `<p>Severity: ${severity}</p>\r\n<p>Message:  ${message}</p>\r\n<p>Filename: ${file}</p>\r\n<p>Line Number: ${line}</p>\r\n\r\n` +
        `\r\n\t<p>Backtrace:</p>\r\n\t${trace}\r\n\r\n</div>`,
    );
  }

  /**
   * A public PHP method that requires arguments, requested by URL (CodeIgniter passes none). PHP 5.6 emits one
   * displayed warning per missing argument and then RUNS the method with those parameters as null.
   * e.g. missingArguments('User::valid_mobile', 1, 'controllers/User.php', 477)
   */
  missingArguments(fn, count, file, line, path) {
    for (let i = 1; i <= count; i++) this.phpWarning(`Missing argument ${i} for ${fn}()`, file, line, { path });
  }

  /**
   * PHP 5.6 fatal error (e.g. "Call to undefined function SMSSend()", "Class 'RekognitionClient' not found"):
   * PHP prints its own message, then CodeIgniter's shutdown handler prints the error view; HTTP 500.
   * Output already buffered is kept. file = path relative to the document root, e.g. 'modules/api/controllers/User.php'.
   */
  fatalError(message, file, line) {
    const docroot = process.env.PHP_DOCROOT || '/home/gmcljain/public_html/';
    const short = file.split('/').slice(-2).join('/');
    this.status = 500;
    this.header('Content-type', 'text/html; charset=UTF-8');
    this.echo(
      `<br />\n<b>Fatal error</b>:  ${message} in <b>${docroot}${file}</b> on line <b>${line}</b><br />\n` +
        '\r\n<div style="border:1px solid #990000;padding-left:20px;margin:0 0 10px 0;">\r\n\r\n' +
        '<h4>A PHP Error was encountered</h4>\r\n\r\n' +
        `<p>Severity: Error</p>\r\n<p>Message:  ${message}</p>\r\n<p>Filename: ${short}</p>\r\n<p>Line Number: ${line}</p>\r\n\r\n` +
        `\r\n\t<p>Backtrace:</p>\r\n\t${'\r\n\t\t\r\n\t'.repeat(4)}\r\n\r\n</div>`,
    );
    this.exited = true;
    throw new PhpExit();
  }

  send({ cors = true } = {}) {
    const res = this.res;
    if (res.headersSent) return;
    res.statusCode = this.status;
    res.setHeader('Expires', 'Thu, 19 Nov 1981 08:52:00 GMT');
    // session_start() (PHP 5.6 "nocache" limiter) sends this; CodeIgniter's output class replaces it with the
    // last Cache-Control set in MY_Controller when the controller completes normally.
    res.setHeader('Cache-Control', this.exited ? 'no-store, no-cache, must-revalidate, post-check=0, pre-check=0' : 'post-check=0, pre-check=0');
    res.setHeader('Pragma', 'no-cache');
    if (cors) for (const [k, v] of Object.entries(CORS_HEADERS)) res.setHeader(k, v);
    const headers = { 'Content-Type': 'text/html; charset=UTF-8', ...this.headers };
    for (const [k, v] of Object.entries(headers)) res.setHeader(k, v);
    const buf = Buffer.from(this.body, 'utf8');
    res.setHeader('Content-Length', buf.length);
    res.end(buf);
  }
}

module.exports = { Output, PhpExit };
