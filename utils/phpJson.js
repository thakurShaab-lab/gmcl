/**
 * Byte-compatible port of the API's my_json_encode() (modules/api/helpers/api_helper.php):
 *
 *   $arr = my_string_array($arr);                 // NULL -> "" inside arrays (not inside objects)
 *   array_walk_recursive($arr, 'json_cb');        // U+0080..U+FFFF -> "&#N;" inside arrays
 *   json_encode($arr, JSON_HEX_AMP)               // & -> &, so the entities survive the next step
 *   mb_decode_numericentity(...)                  // no-op after JSON_HEX_AMP
 *   strip_tags(...)                               // applied to the raw JSON text (when $strip_tag == 'true')
 *
 * JS value conventions (PHP type -> JS):
 *   string -> string, int/float -> number, bool -> boolean,
 *   null -> null, indexed array -> Array, associative array -> plain object or Map (Map keeps insertion
 *   order for numeric keys), stdClass object -> object registered with asObject().
 */
const { PhpFloat, isPhpObject, eq, formatG } = require('./php');

/** PHP strip_tags() (php_strip_tags_ex from PHP 7.4, no allowed tags). */
function stripTags(input) {
  const buf = String(input);
  const end = buf.length;
  let out = '';
  let state = 0;
  let depth = 0;
  let inQ = '';
  let lc = '';
  let br = 0;
  let isXml = false;
  const isSpace = (ch) => ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r' || ch === '\v' || ch === '\f';
  for (let p = 0; p < end; p++) {
    const c = buf[p];
    const prev = p >= 1 ? buf[p - 1] : '';
    if (state === 0) {
      if (c === '\0') continue;
      if (c === '<') {
        if (inQ) continue;
        if (isSpace(buf[p + 1])) {
          out += c;
          continue;
        }
        lc = '<';
        state = 1;
        continue;
      }
      if (c === '>') {
        if (depth) {
          depth--;
          continue;
        }
        if (inQ) continue;
        out += c;
        continue;
      }
      out += c;
    } else if (state === 1) {
      if (c === '\0') continue;
      if (c === '<') {
        if (inQ) continue;
        if (isSpace(buf[p + 1])) continue;
        depth++;
      } else if (c === '>') {
        if (depth) {
          depth--;
          continue;
        }
        if (inQ) continue;
        lc = '>';
        if (isXml && prev === '-') continue;
        inQ = '';
        state = 0;
        isXml = false;
      } else if (c === '"' || c === "'") {
        if (p !== 0 && (!inQ || c === inQ)) inQ = inQ ? '' : c;
      } else if (c === '!') {
        if (prev === '<') {
          state = 3;
          lc = c;
        }
      } else if (c === '?') {
        if (prev === '<') {
          br = 0;
          state = 2;
        }
      }
    } else if (state === 2) {
      if (c === '(') {
        if (lc !== '"' && lc !== "'") {
          lc = '(';
          br++;
        }
      } else if (c === ')') {
        if (lc !== '"' && lc !== "'") {
          lc = ')';
          br--;
        }
      } else if (c === '>') {
        if (depth) {
          depth--;
          continue;
        }
        if (inQ) continue;
        if (!br && lc !== '"' && prev === '?') {
          inQ = '';
          state = 0;
        }
      } else if (c === '"' || c === "'") {
        if (p >= 1 && prev !== '\\') {
          if (lc === c) lc = '';
          else if (lc !== '\\') lc = c;
        }
        if (p !== 0 && (!inQ || c === inQ)) inQ = inQ ? '' : c;
      } else if (c === 'l' || c === 'L') {
        if (p > 4 && /^m$/i.test(buf[p - 1]) && /^x$/i.test(buf[p - 2]) && buf[p - 3] === '?' && buf[p - 4] === '<') {
          state = 1;
          isXml = true;
        }
      }
    } else if (state === 3) {
      if (c === '>') {
        if (depth) {
          depth--;
          continue;
        }
        if (inQ) continue;
        inQ = '';
        state = 0;
      } else if (c === '"' || c === "'") {
        if (p !== 0 && prev !== '\\' && (!inQ || c === inQ)) inQ = inQ ? '' : c;
      } else if (c === '-') {
        if (p >= 2 && prev === '-' && buf[p - 2] === '!') state = 4;
      } else if (c === 'E' || c === 'e') {
        if (p > 6 && buf.slice(p - 6, p).toLowerCase() === 'doctyp') state = 1;
      }
    } else if (state === 4) {
      if (c === '>' && !inQ && p >= 2 && prev === '-' && buf[p - 2] === '-') {
        inQ = '';
        state = 0;
      }
    }
  }
  return out;
}

/** mb_encode_numericentity($s, [0x80, 0xffff, 0, 0xffff], 'UTF-8') */
function encodeNumericEntities(s) {
  let out = '';
  for (const ch of s) {
    const cp = ch.codePointAt(0);
    out += cp >= 0x80 && cp <= 0xffff ? `&#${cp};` : ch;
  }
  return out;
}

/** json_encode() string escaping with JSON_HEX_AMP (slashes and unicode escaped, like PHP). */
function encodeString(s) {
  let out = '"';
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    const code = s.charCodeAt(i);
    switch (c) {
      case '"': out += '\\"'; break;
      case '\\': out += '\\\\'; break;
      case '/': out += '\\/'; break;
      case '&': out += '\\u0026'; break;
      case '\b': out += '\\b'; break;
      case '\f': out += '\\f'; break;
      case '\n': out += '\\n'; break;
      case '\r': out += '\\r'; break;
      case '\t': out += '\\t'; break;
      default:
        if (code < 0x20 || code >= 0x80) out += `\\u${code.toString(16).padStart(4, '0')}`;
        else out += c;
    }
  }
  return `${out}"`;
}

/** PHP 5.6 json_encode() float output: precision 14 (zend_gcvt with 'e'), e.g. 0.1+0.2 -> 0.3, 1e15 -> 1.0e+15. */
function encodeFloat(n) {
  if (!Number.isFinite(n)) return '0';
  return formatG(n, 14, 'e');
}

/** Is a list of [key, value] entries a PHP "packed" array (keys 0..n-1 in order)? */
function isList(keys) {
  return keys.every((k, i) => String(k) === String(i));
}

/**
 * walked = the value is reached only through PHP arrays from the top level, i.e. my_string_array() and
 * array_walk_recursive() processed it. Neither descends into objects.
 */
function encode(value, walked) {
  if (value === null || value === undefined) return 'null';
  if (value === true) return 'true';
  if (value === false) return 'false';
  if (value instanceof PhpFloat) return encodeFloat(value.value);
  if (typeof value === 'number') return Number.isSafeInteger(value) ? String(value) : encodeFloat(value);
  if (typeof value === 'bigint') return value.toString();
  if (typeof value === 'string') return encodeString(walked ? encodeNumericEntities(value) : value);
  if (isPhpObject(value)) {
    const entries = Object.entries(value);
    return `{${entries.map(([k, v]) => `${encodeString(k)}:${encode(v, false)}`).join(',')}}`;
  }
  let entries;
  if (Array.isArray(value)) entries = value.map((v, i) => [i, v]);
  else if (value instanceof Map) entries = [...value.entries()];
  else entries = Object.entries(value);
  // my_string_array(): NULL values inside arrays become "".
  const enc = (v) => encode(walked && (v === null || v === undefined) ? '' : v, walked);
  if (isList(entries.map(([k]) => k))) return `[${entries.map(([, v]) => enc(v)).join(',')}]`;
  return `{${entries.map(([k, v]) => `${encodeString(String(k))}:${enc(v)}`).join(',')}}`;
}

/** my_json_encode($arr, $strip_tag = 'true') */
function myJsonEncode(arr, stripTag = 'true') {
  const json = encode(arr, true);
  return eq(stripTag, 'true') ? stripTags(json) : json;
}

module.exports = { myJsonEncode, stripTags, encodeNumericEntities };
