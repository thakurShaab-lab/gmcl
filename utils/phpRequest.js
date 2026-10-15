/**
 * Builds $_GET / $_POST / $_FILES the way PHP 7 + CodeIgniter 3.0.0 did:
 *  - PHP only parses application/x-www-form-urlencoded and multipart/form-data bodies, and only for POST
 *    (JSON bodies are ignored, exactly like $_POST).
 *  - parse_str() rules: "+" is a space, last duplicate wins, "a[]" appends, "a[k]" nests,
 *    "." and " " in the base name become "_".
 *  - CI's _sanitize_globals(): invisible control characters are removed from every value.
 */
const os = require('os');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const busboy = require('busboy');
const { removeInvisibleCharacters } = require('./xssClean');

const MAX_BODY = 64 * 1024 * 1024;

/** urldecode() over the raw bytes (input strings are latin1 views of the bytes on the wire). */
function decodeComponent(s) {
  const bytes = [];
  const src = Buffer.from(s.replace(/\+/g, ' '), 'latin1');
  for (let i = 0; i < src.length; i++) {
    const hex = i + 2 < src.length ? String.fromCharCode(src[i + 1], src[i + 2]) : '';
    if (src[i] === 0x25 && /^[0-9a-f]{2}$/i.test(hex)) {
      bytes.push(parseInt(hex, 16));
      i += 2;
    } else bytes.push(src[i]);
  }
  // mb_convert_encoding($s, 'UTF-8', 'UTF-8') replaces invalid sequences with "?"
  return Buffer.from(bytes).toString('utf8').replace(/�/g, '?');
}

const cleanValue = (v) => removeInvisibleCharacters(v, false);

/** php_register_variable_ex(): assign one name/value pair into target. */
function registerVariable(target, rawName, value) {
  let name = rawName.replace(/^ +/, '');
  let base = '';
  let i = 0;
  for (; i < name.length; i++) {
    const c = name[i];
    if (c === '[') break;
    base += c === ' ' || c === '.' ? '_' : c;
  }
  if (base === '') return;
  const keys = [];
  let rest = name.slice(i);
  while (rest.startsWith('[')) {
    const close = rest.indexOf(']');
    if (close === -1) {
      // An unmatched "[" becomes "_" and the remainder is part of the plain name.
      if (keys.length === 0) base += `_${rest.slice(1)}`;
      break;
    }
    keys.push(rest.slice(1, close));
    rest = rest.slice(close + 1);
    if (!rest.startsWith('[')) break;
  }
  if (keys.length === 0) {
    target[base] = value;
    return;
  }
  let node = target;
  let key = base;
  for (const k of keys) {
    if (node[key] === null || typeof node[key] !== 'object') node[key] = k === '' ? [] : {};
    let child = node[key];
    if (k !== '' && Array.isArray(child)) {
      child = Object.assign({}, child);
      node[key] = child;
    }
    node = child;
    key = k === '' ? (Array.isArray(node) ? node.length : nextIndex(node)) : k;
  }
  node[key] = value;
}

function nextIndex(obj) {
  const ints = Object.keys(obj).filter((k) => /^(0|-?[1-9]\d*)$/.test(k)).map(Number);
  return ints.length ? Math.max(...ints) + 1 : 0;
}

/** parse_str()-style query string parsing. */
function parseQuery(qs) {
  const out = {};
  if (!qs) return out;
  for (const pair of qs.split('&')) {
    if (!pair) continue;
    const eqPos = pair.indexOf('=');
    const name = decodeComponent(eqPos === -1 ? pair : pair.slice(0, eqPos));
    const value = eqPos === -1 ? '' : decodeComponent(pair.slice(eqPos + 1));
    registerVariable(out, name, cleanValue(value));
  }
  return out;
}

function readRaw(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size <= MAX_BODY) chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('latin1')));
    req.on('error', reject);
  });
}

/** multipart/form-data -> { post, files } with PHP's $_FILES entry shape. */
function parseMultipart(req) {
  return new Promise((resolve, reject) => {
    const post = {};
    const files = {};
    const pending = [];
    let bb;
    try {
      bb = busboy({ headers: req.headers, defParamCharset: 'utf8', limits: { fileSize: MAX_BODY, fieldSize: MAX_BODY } });
    } catch (e) {
      resolve({ post, files });
      return;
    }
    bb.on('field', (name, value) => registerVariable(post, name, cleanValue(value)));
    bb.on('file', (name, stream, info) => {
      const tmpName = path.join(os.tmpdir(), `php${crypto.randomBytes(6).toString('hex')}.tmp`);
      let size = 0;
      const ws = fs.createWriteStream(tmpName);
      stream.on('data', (d) => {
        size += d.length;
      });
      stream.pipe(ws);
      pending.push(
        new Promise((done) => {
          ws.on('finish', () => {
            const noFile = !info.filename && size === 0;
            const entry = {
              name: info.filename || '',
              type: noFile ? '' : info.mimeType,
              tmp_name: noFile ? '' : tmpName,
              error: noFile ? 4 : 0,
              size: noFile ? 0 : size,
            };
            if (noFile) fs.unlink(tmpName, () => {});
            registerFile(files, name, entry);
            done();
          });
        }),
      );
    });
    bb.on('close', () => Promise.all(pending).then(() => resolve({ post, files })));
    bb.on('error', reject);
    req.pipe(bb);
  });
}

/** $_FILES layout: "f" -> {name,...}; "f[]" / "f[k]" -> {name:[...], type:[...], ...}. */
function registerFile(files, rawName, entry) {
  const m = rawName.match(/^([^[]+)(\[.*\])?$/);
  const base = m ? m[1].replace(/[ .]/g, '_') : rawName;
  if (!m || !m[2]) {
    files[base] = entry;
    return;
  }
  const sub = m[2].slice(1, m[2].indexOf(']'));
  if (!files[base] || typeof files[base].name !== 'object') files[base] = { name: {}, type: {}, tmp_name: {}, error: {}, size: {} };
  const key = sub === '' ? nextIndex(files[base].name) : sub;
  for (const f of Object.keys(entry)) files[base][f][key] = entry[f];
}

/** Returns { get, post, files } for an incoming request. */
async function parsePhpGlobals(req) {
  const qIndex = req.originalUrl.indexOf('?');
  const get = parseQuery(qIndex === -1 ? '' : req.originalUrl.slice(qIndex + 1));
  let post = {};
  let files = {};
  if (req.method === 'POST') {
    const type = String(req.headers['content-type'] || '').toLowerCase();
    if (type.startsWith('application/x-www-form-urlencoded')) {
      const raw = await readRaw(req);
      post = parseQuery(raw);
    } else if (type.startsWith('multipart/form-data')) {
      ({ post, files } = await parseMultipart(req));
    }
  }
  return { get, post, files };
}

/** Removes uploaded temp files that were not moved (PHP deletes them at request end). */
function cleanupFiles(files) {
  for (const entry of Object.values(files || {})) {
    const names = typeof entry.tmp_name === 'object' ? Object.values(entry.tmp_name) : [entry.tmp_name];
    for (const n of names) if (n) fs.unlink(n, () => {});
  }
}

module.exports = { parsePhpGlobals, cleanupFiles, parseQuery };
