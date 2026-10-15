/**
 * Port of apps/libraries/Safe_encrypt.php — used to store/compare customer passwords.
 * openssl_encrypt(AES-256-CBC) with PHP's key/iv derivation, then URL-safe base64 of the base64 output.
 */
const crypto = require('crypto');
const { trim, str } = require('./php');

const SECRET_KEY = 'SuPerEncKey_weblinkindia';
// PHP passes the 64-char hex digest as the key; OpenSSL uses its first 32 bytes.
const KEY = Buffer.from(crypto.createHash('sha256').update(SECRET_KEY).digest('hex').slice(0, 32), 'latin1');
const IV = Buffer.from(crypto.createHash('sha256').update('AES256CBC').digest('hex').slice(0, 16), 'latin1');

const safeB64encode = (s) => Buffer.from(s, 'latin1').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');

function safeB64decode(s) {
  let data = s.replace(/-/g, '+').replace(/_/g, '/');
  const mod4 = data.length % 4;
  if (mod4) data += '===='.slice(mod4);
  return Buffer.from(data, 'base64').toString('latin1');
}

function encrypt(value) {
  const cipher = crypto.createCipheriv('aes-256-cbc', KEY, IV);
  const b64 = Buffer.concat([cipher.update(Buffer.from(value, 'utf8')), cipher.final()]).toString('base64');
  return safeB64encode(b64);
}

function decrypt(value) {
  try {
    const decipher = crypto.createDecipheriv('aes-256-cbc', KEY, IV);
    const raw = Buffer.from(safeB64decode(value), 'base64');
    return Buffer.concat([decipher.update(raw), decipher.final()]).toString('utf8');
  } catch (e) {
    return false;
  }
}

/** encode($value): false for empty values, like PHP. */
function encode(value) {
  if (!value || value === '0') return false;
  return trim(encrypt(str(value)));
}

/** decode($value): false for empty values; trim(false) === "" when decryption fails. */
function decode(value) {
  if (!value || value === '0') return false;
  return trim(decrypt(str(value)));
}

module.exports = { encode, decode, safeB64encode, safeB64decode };
