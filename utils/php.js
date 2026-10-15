/**
 * Small, faithful equivalents of the PHP 7 built-ins the original API relied on.
 * Values coming from MySQL are strings (like mysqli), so most helpers accept strings.
 */
const crypto = require('crypto');

/* ------------------------------------------------------------------ types */

/** Marks a number that PHP holds as a float (json_encode prints 5.0, not 5). */
class PhpFloat {

  constructor(value) {
    this.value = Number(value);
  }
  valueOf() {
    return this.value;
  }
  toString() {
    return floatToString(this.value);
  }
}
const phpFloat = (v) => (v instanceof PhpFloat ? v : new PhpFloat(v));

/**
 * Marks a JS object as a PHP stdClass object (rows from ->row()/->result()).
 * my_json_encode() leaves objects untouched: nulls stay null, non-ASCII is \u-escaped,
 * and an empty object encodes as {} instead of [].
 */
const phpObjects = new WeakSet();
function asObject(obj) {
  if (obj && typeof obj === 'object') phpObjects.add(obj);
  return obj;
}
const asObjects = (rows) => (Array.isArray(rows) ? rows.map(asObject) : rows);
const isPhpObject = (v) => v !== null && typeof v === 'object' && phpObjects.has(v);

/**
 * PHP's zend_gcvt(value, precision): %G-style formatting with `precision` significant digits. Exponent form is
 * used when the exponent is < -4 or >= precision, and a single-digit mantissa gets ".0" ("1.0E+25").
 * (string)$float uses precision 14 with "E"; PHP 5.6 json_encode() uses precision 14 with "e".
 */
function formatG(n, precision = 14, e = 'E') {
  if (!Number.isFinite(n)) return Number.isNaN(n) ? 'NAN' : n > 0 ? 'INF' : '-INF';
  if (n === 0) return '0';
  const [mant, expStr] = n.toExponential(precision - 1).split('e');
  const exp = Number(expStr);
  if (exp < -4 || exp >= precision) {
    let m = mant.includes('.') ? mant.replace(/0+$/, '').replace(/\.$/, '') : mant;
    if (!m.includes('.')) m += '.0';
    return `${m}${e}${exp < 0 ? '-' : '+'}${Math.abs(exp)}`;
  }
  const fixed = Number(mant) * 10 ** exp;
  let out = Number(fixed.toPrecision(precision)).toFixed(Math.max(0, precision - 1 - exp));
  if (out.includes('.')) out = out.replace(/0+$/, '').replace(/\.$/, '');
  return out;
}

/** PHP (string) cast of a float: precision 14 ("0.1+0.2" -> "0.3", 1e25 -> "1.0E+25"). */
function floatToString(n) {
  if (Object.is(n, -0)) return '-0';
  return formatG(n, 14, 'E');
}
function str(v) {
  if (v === null || v === undefined || v === false) return '';
  if (v === true) return '1';
  if (v instanceof PhpFloat) return floatToString(v.value);
  if (typeof v === 'number') return Number.isSafeInteger(v) ? String(v) : floatToString(v);
  if (Array.isArray(v)) return 'Array';
  return String(v);
}

/* --------------------------------------------------------- numeric parsing */

const NUMERIC_RE = /^[ \t\n\r\v\f]*[+-]?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?$/;
const LEADING_NUM_RE = /^[ \t\n\r\v\f]*[+-]?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?/;

/** PHP 7 is_numeric() (leading whitespace allowed, trailing not). */
function isNumeric(v) {
  if (typeof v === 'number' || v instanceof PhpFloat) return Number.isFinite(Number(v));
  return typeof v === 'string' && NUMERIC_RE.test(v);
}

/** Numeric value of a PHP scalar as used in arithmetic ("12abc" -> 12, "abc" -> 0). */
function num(v) {
  if (v instanceof PhpFloat) return v.value;
  if (typeof v === 'number') return v;
  if (v === true) return 1;
  if (v === null || v === undefined || v === false) return 0;
  if (Array.isArray(v)) return v.length ? 1 : 0;
  const m = String(v).match(LEADING_NUM_RE);
  return m ? Number(m[0]) : 0;
}

/** (int) / intval() — PHP 5.6: strings convert by their leading integer only ((int)"1e3" === 1). */
function intval(v) {
  if (typeof v === 'string') {
    const m = v.match(/^[ \t\n\r\v\f]*([+-]?\d+)/);
    if (!m) return 0;
    const n = Number(m[1]);
    return Math.abs(n) > 9223372036854775807 ? (n < 0 ? -9223372036854775808 : 9223372036854775807) : n;
  }
  const n = num(v);
  if (!Number.isFinite(n)) return 0;
  return Math.trunc(n) || 0;
}

/** (float) / floatval() */
const floatval = (v) => num(v);

/** PHP empty() */
function empty(v) {
  if (v === undefined || v === null || v === false || v === '' || v === '0' || v === 0) return true;
  if (v instanceof PhpFloat) return v.value === 0;
  if (Array.isArray(v)) return v.length === 0;
  if (v instanceof Map) return v.size === 0;
  if (typeof v === 'object') return isPhpObject(v) ? false : Object.keys(v).length === 0;
  return false;
}

/** PHP 7 loose comparison (==). */
function eq(a, b) {
  if (a instanceof PhpFloat) a = a.value;
  if (b instanceof PhpFloat) b = b.value;
  if (a === undefined) a = null;
  if (b === undefined) b = null;
  if (typeof a === 'boolean' || typeof b === 'boolean') return toBool(a) === toBool(b);
  if (a === null && b === null) return true;
  if (a === null) return typeof b === 'string' ? b === '' : toBool(b) === false;
  if (b === null) return typeof a === 'string' ? a === '' : toBool(a) === false;
  if (typeof a === 'string' && typeof b === 'string') {
    if (isNumeric(a) && isNumeric(b)) return Number(a) === Number(b);
    return a === b;
  }
  // PHP 7: a non-numeric string is converted to a number ("abc" == 0 is true).
  if (typeof a === 'number' && typeof b === 'string') return a === num(b);
  if (typeof a === 'string' && typeof b === 'number') return eq(b, a);
  if (typeof a === 'number' && typeof b === 'number') return a === b;
  return a == b; // eslint-disable-line eqeqeq
}
const neq = (a, b) => !eq(a, b);

/** PHP truthiness ((bool) cast). */
function toBool(v) {
  return !empty(v) || (typeof v === 'object' && v !== null && isPhpObject(v));
}

/** in_array($needle, $haystack, $strict) */
function inArray(needle, haystack, strict = false) {
  const values = haystack instanceof Map ? [...haystack.values()] : Array.isArray(haystack) ? haystack : Object.values(haystack || {});
  return values.some((v) => (strict ? v === needle : eq(v, needle)));
}

/* ---------------------------------------------------------------- strings */

const PHP_TRIM_CHARS = ' \t\n\r\0\x0B';
function trim(s, chars = PHP_TRIM_CHARS) {
  s = str(s);
  let start = 0;
  let end = s.length;
  while (start < end && chars.includes(s[start])) start++;
  while (end > start && chars.includes(s[end - 1])) end--;
  return s.slice(start, end);
}
function rtrim(s, chars = PHP_TRIM_CHARS) {
  s = str(s);
  let end = s.length;
  while (end > 0 && chars.includes(s[end - 1])) end--;
  return s.slice(0, end);
}
function ltrim(s, chars = PHP_TRIM_CHARS) {
  s = str(s);
  let start = 0;
  while (start < s.length && chars.includes(s[start])) start++;
  return s.slice(start);
}

// PHP 7 strtolower/strtoupper/ucwords are byte-based and only touch ASCII letters.
const strtolower = (s) => str(s).replace(/[A-Z]+/g, (m) => m.toLowerCase());
const strtoupper = (s) => str(s).replace(/[a-z]+/g, (m) => m.toUpperCase());
const ucfirst = (s) => {
  s = str(s);
  return s ? s[0].replace(/[a-z]/, (c) => c.toUpperCase()) + s.slice(1) : s;
};
const ucwords = (s) => str(s).replace(/(^|[ \t\r\n\f\v])([a-z])/g, (m, sp, c) => sp + c.toUpperCase());

/** strlen() counts bytes. */
const strlen = (s) => Buffer.byteLength(str(s), 'utf8');

/** substr() works on bytes. */
function substr(s, start, length) {
  const buf = Buffer.from(str(s), 'utf8');
  const len = buf.length;
  if (start < 0) start = Math.max(len + start, 0);
  if (start > len) return '';
  let end = length === undefined || length === null ? len : length < 0 ? len + length : start + length;
  end = Math.min(end, len);
  if (end <= start) return '';
  return buf.subarray(start, end).toString('utf8');
}

const md5 = (s) => crypto.createHash('md5').update(str(s), 'utf8').digest('hex');
const sha1 = (s) => crypto.createHash('sha1').update(str(s), 'utf8').digest('hex');

/** rand()/mt_rand() */
const rand = (min = 0, max = 2147483647) => crypto.randomInt(Number(min), Number(max) + 1);

/** CI random_string() */
function randomString(type = 'alnum', len = 8) {
  const pools = {
    alpha: 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ',
    alnum: '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ',
    numeric: '0123456789',
    nozero: '123456789',
  };
  if (pools[type]) {
    let out = '';
    for (let i = 0; i < len; i++) out += pools[type][crypto.randomInt(pools[type].length)];
    return out;
  }
  if (type === 'unique' || type === 'md5') return md5(crypto.randomBytes(16).toString('hex'));
  if (type === 'sha1') return sha1(crypto.randomBytes(16).toString('hex'));
  return '';
}

function strPad(input, length, pad = ' ', type = 'right') {
  input = str(input);
  const total = length - input.length;
  if (total <= 0 || !pad) return input;
  if (type === 'left') return pad.repeat(Math.ceil(total / pad.length)).slice(0, total) + input;
  if (type === 'both') {
    const left = Math.floor(total / 2);
    const right = total - left;
    return pad.repeat(left).slice(0, left) + input + pad.repeat(right).slice(0, right);
  }
  return input + pad.repeat(Math.ceil(total / pad.length)).slice(0, total);
}

const htmlspecialchars = (s) =>
  str(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const nl2br = (s) => str(s).replace(/(\r\n|\n\r|\n|\r)/g, '<br />$1');

/**
 * url_title() as overridden in apps/helpers/MY_url_helper.php (separator 'dash'|'underscore', lowercase).
 * Its foreign-character table is stored mis-encoded in the PHP source and never matches real UTF-8, so it is a no-op.
 */
function urlTitle(input, separator = 'dash', lowercase = true) {
  const { stripTags } = require('./phpJson'); // eslint-disable-line global-require
  const rep = separator === 'dash' ? '-' : '_';
  const q = rep === '-' ? '\\-' : '_';
  let s = stripTags(str(input));
  const trans = [
    [/&#\d+?;/gi, ''],
    [/&\S+?;/gi, ''],
    [/\s+/gi, rep],
    [/[^a-z0-9\-._]/gi, ''],
    [new RegExp(`${q}+`, 'gi'), rep],
    [new RegExp(`${q}$`, 'gi'), rep],
    [new RegExp(`^${q}`, 'gi'), rep],
    [/\.+$/gi, ''],
  ];
  for (const [re, val] of trans) s = s.replace(re, val);
  if (lowercase) s = s.toLowerCase();
  s = s.replace(/[^a-z 0-9~%.:_-]/gi, '');
  return trim(s.replace(/\\(.?)/g, '$1')); // stripslashes()
}

/* ----------------------------------------------------------------- numbers */

/** PHP 7 round(): half away from zero with pre-rounding to 15 significant digits. Returns a JS number (PHP float). */
function round(value, places = 0) {
  value = num(value);
  if (!Number.isFinite(value) || value === 0) return value;
  const f = 10 ** Math.abs(places);
  let tmp = places >= 0 ? value * f : value / f;
  tmp = Number(tmp.toPrecision(15));
  const r = Math.sign(tmp) * Math.floor(Math.abs(tmp) + 0.5);
  const res = places >= 0 ? r / f : r * f;
  return Number(res.toPrecision(15));
}

/** number_format() */
function numberFormat(value, decimals = 0, decPoint = '.', thousandsSep = ',') {
  const n = round(num(value), decimals);
  const neg = n < 0;
  const [intPart, frac = ''] = Math.abs(n).toFixed(Math.max(0, decimals)).split('.');
  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, thousandsSep);
  const isZero = Number(`${intPart}.${frac || 0}`) === 0;
  return (neg && !isZero ? '-' : '') + grouped + (decimals > 0 ? decPoint + frac : '');
}

/* ------------------------------------------------------------------ dates */

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const pad = (n, w = 2) => {
  const s = String(Math.abs(n)).padStart(w, '0');
  return n < 0 ? `-${s}` : s;
};

/** time() */
const time = () => Math.floor(Date.now() / 1000);

/** date($format, $timestamp) in the application timezone (process.env.TZ). */
function phpDate(format, timestamp) {
  const d = new Date(timestamp === undefined || timestamp === null ? Date.now() : Number(timestamp) * 1000);
  if (Number.isNaN(d.getTime())) return phpDate(format, 0);
  const Y = d.getFullYear();
  const m = d.getMonth();
  const day = d.getDate();
  const w = d.getDay();
  const H = d.getHours();
  const tzMin = -d.getTimezoneOffset();
  const tzStr = (sep) => `${tzMin >= 0 ? '+' : '-'}${pad(Math.floor(Math.abs(tzMin) / 60))}${sep}${pad(Math.abs(tzMin) % 60)}`;
  const startOfYear = new Date(Y, 0, 1);
  const dayOfYear = Math.round((new Date(Y, m, day) - startOfYear) / 86400000);
  const isLeap = (Y % 4 === 0 && Y % 100 !== 0) || Y % 400 === 0;
  const isoWeek = () => {
    const t = new Date(Date.UTC(Y, m, day));
    const dn = t.getUTCDay() || 7;
    t.setUTCDate(t.getUTCDate() + 4 - dn);
    const yStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
    return { week: Math.ceil(((t - yStart) / 86400000 + 1) / 7), year: t.getUTCFullYear() };
  };
  const suffix = (n) => (n % 10 === 1 && n !== 11 ? 'st' : n % 10 === 2 && n !== 12 ? 'nd' : n % 10 === 3 && n !== 13 ? 'rd' : 'th');
  let out = '';
  for (let i = 0; i < format.length; i++) {
    const c = format[i];
    switch (c) {
      case 'd': out += pad(day); break;
      case 'D': out += DAYS[w].slice(0, 3); break;
      case 'j': out += day; break;
      case 'l': out += DAYS[w]; break;
      case 'N': out += w || 7; break;
      case 'S': out += suffix(day); break;
      case 'w': out += w; break;
      case 'z': out += dayOfYear; break;
      case 'W': out += pad(isoWeek().week); break;
      case 'F': out += MONTHS[m]; break;
      case 'm': out += pad(m + 1); break;
      case 'M': out += MONTHS[m].slice(0, 3); break;
      case 'n': out += m + 1; break;
      case 't': out += new Date(Y, m + 1, 0).getDate(); break;
      case 'L': out += isLeap ? 1 : 0; break;
      case 'o': out += isoWeek().year; break;
      case 'Y': out += Y < 0 ? `-${pad(-Y, 4)}` : pad(Y, 4); break;
      case 'y': out += pad(Math.abs(Y) % 100); break;
      case 'a': out += H < 12 ? 'am' : 'pm'; break;
      case 'A': out += H < 12 ? 'AM' : 'PM'; break;
      case 'g': out += H % 12 || 12; break;
      case 'G': out += H; break;
      case 'h': out += pad(H % 12 || 12); break;
      case 'H': out += pad(H); break;
      case 'i': out += pad(d.getMinutes()); break;
      case 's': out += pad(d.getSeconds()); break;
      case 'u': out += '000000'; break;
      case 'v': out += '000'; break;
      case 'e': out += process.env.TZ; break;
      case 'I': out += 0; break;
      case 'O': out += tzStr(''); break;
      case 'P': out += tzStr(':'); break;
      case 'T': out += tzStr(':'); break;
      case 'Z': out += tzMin * 60; break;
      case 'c': out += phpDate('Y-m-d\\TH:i:sP', d.getTime() / 1000); break;
      case 'r': out += phpDate('D, d M Y H:i:s O', d.getTime() / 1000); break;
      case 'U': out += Math.floor(d.getTime() / 1000); break;
      case '\\': i++; if (i < format.length) out += format[i]; break;
      default: out += c;
    }
  }
  return out;
}

/** mktime(hour, minute, second, month, day, year) */
function mktime(h, i, s, mo, d, y) {
  const now = new Date();
  const dt = new Date(2000, 0, 1);
  dt.setFullYear(
    y === undefined ? now.getFullYear() : intval(y),
    (mo === undefined ? now.getMonth() + 1 : intval(mo)) - 1,
    d === undefined ? now.getDate() : intval(d),
  );
  dt.setHours(h === undefined ? now.getHours() : intval(h), i === undefined ? now.getMinutes() : intval(i), s === undefined ? now.getSeconds() : intval(s), 0);
  return Math.floor(dt.getTime() / 1000);
}

const UNIT_RE = /([+-]?\s*\d+)\s*(sec|second|min|minute|hour|day|week|fortnight|month|year)s?\b/gi;

/**
 * strtotime() for the formats this project uses: absolute dates (Y-m-d[ H:i[:s]], d-m-Y, m/d/Y),
 * now/today/tomorrow/yesterday/midnight and relative offsets ("+1 day", "-2 months", "Y-m-d +7 days").
 * Returns false when the string cannot be parsed, like PHP.
 */
function strtotime(input, now) {
  let s = trim(str(input)).toLowerCase();
  if (s === '') return false;
  const base = new Date(now === undefined ? Date.now() : Number(now) * 1000);
  let dt = new Date(base.getTime());
  let matched = false;
  let m;
  const setDate = (y, mo, d) => {
    dt = new Date(2000, 0, 1);
    dt.setFullYear(y, mo - 1, d);
    dt.setHours(0, 0, 0, 0);
  };
  if ((m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ t](\d{1,2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?)?/))) {
    setDate(+m[1], +m[2], +m[3]);
    if (m[4] !== undefined) dt.setHours(+m[4], +m[5], +(m[6] || 0), 0);
    s = s.slice(m[0].length);
    matched = true;
  } else if ((m = s.match(/^(\d{1,2})-(\d{1,2})-(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/))) {
    setDate(+m[3], +m[2], +m[1]);
    if (m[4] !== undefined) dt.setHours(+m[4], +m[5], +(m[6] || 0), 0);
    s = s.slice(m[0].length);
    matched = true;
  } else if ((m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/))) {
    setDate(+m[3], +m[1], +m[2]);
    if (m[4] !== undefined) dt.setHours(+m[4], +m[5], +(m[6] || 0), 0);
    s = s.slice(m[0].length);
    matched = true;
  }
  s = s.trim();
  if (/^(now)\b/.test(s)) { s = s.slice(3).trim(); matched = true; }
  if ((m = s.match(/^(today|midnight|tomorrow|yesterday)\b/))) {
    dt.setHours(0, 0, 0, 0);
    if (m[1] === 'tomorrow') dt.setDate(dt.getDate() + 1);
    if (m[1] === 'yesterday') dt.setDate(dt.getDate() - 1);
    s = s.slice(m[0].length).trim();
    matched = true;
  }
  if ((m = s.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?/))) {
    dt.setHours(+m[1], +m[2], +(m[3] || 0), 0);
    s = s.slice(m[0].length).trim();
    matched = true;
  }
  let rest = s.replace(UNIT_RE, (all, n, unit) => {
    const v = parseInt(n.replace(/\s+/g, ''), 10);
    unit = unit.toLowerCase();
    if (unit === 'sec' || unit === 'second') dt.setSeconds(dt.getSeconds() + v);
    else if (unit === 'min' || unit === 'minute') dt.setMinutes(dt.getMinutes() + v);
    else if (unit === 'hour') dt.setHours(dt.getHours() + v);
    else if (unit === 'day') dt.setDate(dt.getDate() + v);
    else if (unit === 'week') dt.setDate(dt.getDate() + v * 7);
    else if (unit === 'fortnight') dt.setDate(dt.getDate() + v * 14);
    else if (unit === 'month') dt.setMonth(dt.getMonth() + v);
    else if (unit === 'year') dt.setFullYear(dt.getFullYear() + v);
    matched = true;
    return '';
  });
  rest = rest.trim();
  if (!matched || rest !== '') return false;
  return Math.floor(dt.getTime() / 1000);
}

module.exports = {
  formatG,
  PhpFloat,
  phpFloat,
  asObject,
  asObjects,
  isPhpObject,
  floatToString,
  str,
  isNumeric,
  num,
  intval,
  floatval,
  empty,
  eq,
  neq,
  toBool,
  inArray,
  trim,
  rtrim,
  ltrim,
  strtolower,
  strtoupper,
  ucfirst,
  ucwords,
  strlen,
  substr,
  md5,
  sha1,
  rand,
  randomString,
  strPad,
  htmlspecialchars,
  nl2br,
  urlTitle,
  round,
  numberFormat,
  time,
  phpDate,
  mktime,
  strtotime,
};
