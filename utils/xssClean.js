/**
 * Port of CodeIgniter 3.0.0 CI_Security::xss_clean() (with MY_Security::_remove_evil_attributes),
 * used by $this->input->post($key, TRUE) and $this->security->xss_clean().
 */
const crypto = require('crypto');
const { decodeHTML } = require('entities');
const { str } = require('./php');

const NEVER_ALLOWED_STR = [
  ['document.cookie', '[removed]'],
  ['document.write', '[removed]'],
  ['.parentNode', '[removed]'],
  ['.innerHTML', '[removed]'],
  ['-moz-binding', '[removed]'],
  ['<!--', '&lt;!--'],
  ['-->', '--&gt;'],
  ['<![CDATA[', '&lt;![CDATA['],
  ['<comment>', '&lt;comment&gt;'],
];
const NEVER_ALLOWED_REGEX = [
  /javascript\s*:/gis,
  /(document|(document\.)?window)\.(location|on\w*)/gis,
  /expression\s*(\(|&#40;)/gis,
  /vbscript\s*:/gis,
  /wscript\s*:/gis,
  /jscript\s*:/gis,
  /vbs\s*:/gis,
  /Redirect\s+30\d/gis,
  /(["'])?data\s*:[^\x01]*?base64[^\x01]*?,[^\x01]*?\1?/gis,
];

const XSS_HASH = crypto.randomBytes(16).toString('hex');

/** CI remove_invisible_characters() */
function removeInvisibleCharacters(str, urlEncoded = true) {
  const patterns = [];
  if (urlEncoded) patterns.push(/%0[0-8bcef]/g, /%1[0-9a-f]/g);
  patterns.push(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]+/g);
  let count;
  do {
    count = 0;
    for (const re of patterns) {
      str = str.replace(re, () => {
        count++;
        return '';
      });
    }
  } while (count);
  return str;
}

/** PHP rawurldecode(): decodes %XX sequences only (no "+" handling), byte-wise. */
function rawurldecode(str) {
  if (!str.includes('%')) return str;
  const bytes = [];
  const src = Buffer.from(str, 'utf8');
  for (let i = 0; i < src.length; i++) {
    if (src[i] === 0x25 && i + 2 < src.length && /^[0-9a-f]{2}$/i.test(String.fromCharCode(src[i + 1], src[i + 2]))) {
      bytes.push(parseInt(String.fromCharCode(src[i + 1], src[i + 2]), 16));
      i += 2;
    } else bytes.push(src[i]);
  }
  return Buffer.from(bytes).toString('utf8');
}

function doNeverAllowed(str) {
  for (const [from, to] of NEVER_ALLOWED_STR) str = str.split(from).join(to);
  for (const re of NEVER_ALLOWED_REGEX) str = str.replace(re, '[removed]');
  return str;
}

/** CI entity_decode() with ENT_COMPAT | ENT_HTML5 (single-quote entities are left alone). */
function entityDecode(str) {
  if (!str.includes('&')) return str;
  let compare;
  do {
    compare = str;
    str = str.replace(/(&#(?:x0*[0-9a-f]{2,5}(?![0-9a-f;])|(?:0*\d{2,4}(?![0-9;]))))/gi, '$1;');
    str = str.replace(/&(?:#(?:x[0-9a-f]+|\d+)|[a-z][a-z0-9]*);?/gi, (ent) => {
      if (/^&(#0*39|#x0*27|apos);?$/i.test(ent)) return ent;
      if (!ent.endsWith(';') && !/^&#/.test(ent)) {
        // html_entity_decode() only decodes terminated entities; CI first resolves known ones without ";"
        const decoded = decodeHTML(`${ent};`);
        return decoded !== `${ent};` ? decoded : ent;
      }
      return ent.endsWith(';') ? decodeHTML(ent) : ent;
    });
  } while (compare !== str);
  return str;
}

function filterAttributes(str) {
  let out = '';
  const re = /\s*[a-z-]+\s*=\s*(\x22|\x27)([^\x01]*?)\1/gis;
  let m;
  while ((m = re.exec(str)) !== null) out += m[0].replace(/\/\*.*?\*\//gs, '');
  return out;
}

function jsLinkRemoval(match, attrs) {
  const cleaned = filterAttributes(attrs.replace(/[<>]/g, '')).replace(
    /href=.*?(?:(?:alert|prompt|confirm)(?:\(|&#40;)|javascript:|livescript:|mocha:|charset=|window\.|document\.|\.cookie|<script|<xss|data\s*:)/gis,
    '',
  );
  return match.split(attrs).join(cleaned);
}

function jsImgRemoval(match, attrs) {
  const cleaned = filterAttributes(attrs.replace(/[<>]/g, '')).replace(
    /src=.*?(?:(?:alert|prompt|confirm)(?:\(|&#40;)|javascript:|livescript:|mocha:|charset=|window\.|document\.|\.cookie|<script|<xss|base64\s*,)/gis,
    '',
  );
  return match.split(attrs).join(cleaned);
}

/** MY_Security::_remove_evil_attributes() — /sitepanel/, /ads/ and /member/ URIs keep "style". */
function removeEvilAttributes(str, isImage, requestUri) {
  const keepStyle = /\/sitepanel\/|\/ads\/|\/member\//.test(requestUri || '');
  let evil = keepStyle ? ['on\\w*', 'xmlns'] : ['on\\w*', 'style', 'xmlns'];
  if (isImage) evil = evil.filter((a) => a !== 'xmlns');
  const re = new RegExp(`<(/?[^><]+?)([^A-Za-z\\-])(${evil.join('|')})(\\s*=\\s*)(["][^>]*?["]|['][^>]*?[']|[^>]*?)([\\s><])([><]*)`, 'gi');
  let count;
  do {
    count = 0;
    str = str.replace(re, (all, g1, g2, g3, g4, g5, g6) => {
      count++;
      return `<${g1}${g6}`;
    });
  } while (count);
  return str;
}

const WORDS = ['javascript', 'expression', 'vbscript', 'jscript', 'wscript', 'vbs', 'script', 'base64', 'applet', 'alert', 'document', 'write', 'cookie', 'window', 'confirm', 'prompt'];
const WORD_RES = WORDS.map((w) => new RegExp(`(${w.split('').join('\\s*')})(\\W)`, 'gis'));
const NAUGHTY =
  'alert|prompt|confirm|applet|audio|basefont|base|behavior|bgsound|blink|body|embed|expression|form|frameset|frame|head|html|ilayer|iframe|input|button|select|isindex|layer|link|meta|keygen|object|plaintext|style|script|textarea|title|math|video|svg|xml|xss';

function cleanString(str, requestUri) {
  str = removeInvisibleCharacters(String(str));
  do {
    str = rawurldecode(str);
  } while (/%[0-9a-f]{2,}/i.test(str));

  str = str.replace(/[^a-z0-9>]+[a-z0-9]+=(['"]).*?\1/gis, (m) => m.replace(/>/g, '&gt;').replace(/</g, '&lt;').replace(/\\/g, '\\\\'));
  str = str.replace(/<\w+.*/gis, (m) => {
    const hashed = m.replace(/&([a-z_0-9-]+)=([a-z_0-9\-/]+)/gi, `${XSS_HASH}$1=$2`);
    return entityDecode(hashed).split(XSS_HASH).join('&');
  });
  str = removeInvisibleCharacters(str);
  str = str.split('\t').join(' ');
  str = doNeverAllowed(str);
  str = str.split('<?').join('&lt;?').split('?>').join('?&gt;');
  for (const re of WORD_RES) str = str.replace(re, (all, word, tail) => word.replace(/\s+/g, '') + tail);

  let original;
  do {
    original = str;
    if (/<a/i.test(str)) str = str.replace(/<a[^a-z0-9>]+([^>]*?)(?:>|$)/gis, jsLinkRemoval);
    if (/<img/i.test(str)) str = str.replace(/<img[^a-z0-9]+([^>]*?)(?:\s?\/?>|$)/gis, jsImgRemoval);
    if (/script|xss/i.test(str)) str = str.replace(/<\/*(?:script|xss).*?>/gis, '[removed]');
  } while (original !== str);

  str = removeEvilAttributes(str, false, requestUri);
  str = str.replace(
    new RegExp(`<(/*\\s*)(${NAUGHTY})([^><]*)([><]*)`, 'gis'),
    (all, a, b, c, d) => `&lt;${a}${b}${c}${d.replace(/>/g, '&gt;').replace(/</g, '&lt;')}`,
  );
  str = str.replace(
    /(alert|prompt|confirm|cmd|passthru|eval|exec|expression|system|fopen|fsockopen|file|file_get_contents|readfile|unlink)(\s*)\((.*?)\)/gis,
    '$1$2&#40;$3&#41;',
  );
  return doNeverAllowed(str);
}

/** xss_clean($str): arrays/objects are cleaned value by value. */
function xssClean(value, requestUri = '') {
  if (value === undefined) return value;
  if (value === null) return cleanString('', requestUri); // preg_replace(NULL) -> ""
  if (Array.isArray(value)) return value.map((v) => xssClean(v, requestUri));
  if (typeof value === 'object') {
    const out = {};
    // Inside an array PHP has no undefined: missing values are NULL, which preg_replace() turns into "".
    for (const [k, v] of Object.entries(value)) out[k] = xssClean(v === undefined ? null : v, requestUri);
    return out;
  }
  // preg_replace() turns non-strings into strings: null/false -> "", true -> "1", 5 -> "5"
  return cleanString(str(value), requestUri);
}

module.exports = { xssClean, removeInvisibleCharacters };
