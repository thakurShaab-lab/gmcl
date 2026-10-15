/**
 * Port of MY_Upload::my_upload($field, $path) on top of CodeIgniter 3.0.0 CI_Upload::do_upload().
 * Returns { upload_data: {...} } on success and undefined on failure (PHP returned nothing).
 */
const fs = require('fs');
const path = require('path');
const env = require('../config/env');
const mimes = require('../config/mimes.json');
const { configItem } = require('../config/app');
const { strtolower, urlTitle, round, num } = require('./php');
const { removeInvisibleCharacters } = require('./xssClean');

const BAD_CHARS = ['../', '<!--', '-->', '<', '>', "'", '"', '&', '$', '#', '{', '}', '[', ']', '=', ';', '?', '%20', '%22', '%3c', '%253c', '%3e', '%0e', '%28', '%29', '%2528', '%26', '%24', '%3f', '%3b', '%3d', './', '/'];

/** file_ext(): lower-case extension without the dot. */
function fileExt(name) {
  const i = name.lastIndexOf('.');
  return i === -1 ? '' : strtolower(name.slice(i + 1));
}

function getExtension(filename) {
  const parts = filename.split('.');
  return parts.length === 1 ? '' : `.${parts[parts.length - 1]}`; // file_ext_tolower = FALSE
}

/** finfo-style MIME detection for the types this API accepts; falls back to the client-sent type. */
function detectMime(file) {
  let b;
  try {
    const fd = fs.openSync(file.tmp_name, 'r');
    b = Buffer.alloc(12);
    fs.readSync(fd, b, 0, 12, 0);
    fs.closeSync(fd);
  } catch (e) {
    return file.type;
  }
  if (b[0] === 0xff && b[1] === 0xd8) return 'image/jpeg';
  if (b.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))) return 'image/png';
  if (b.subarray(0, 3).toString() === 'GIF') return 'image/gif';
  if (b.subarray(0, 4).toString() === '%PDF') return 'application/pdf';
  if (b.subarray(0, 4).toString() === 'RIFF' && b.subarray(8, 12).toString() === 'WEBP') return 'image/webp';
  return String(file.type || '').replace(/^(.+?);.*$/, '$1').toLowerCase();
}

function isImageReadable(tmp) {
  try {
    const fd = fs.openSync(tmp, 'r');
    const b = Buffer.alloc(8);
    fs.readSync(fd, b, 0, 8, 0);
    fs.closeSync(fd);
    return (b[0] === 0xff && b[1] === 0xd8) || b.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex')) || b.subarray(0, 3).toString() === 'GIF';
  } catch (e) {
    return false;
  }
}

/** MY_Upload::_prep_filename() */
function prepFilename(filename) {
  const pos = filename.lastIndexOf('.');
  if (pos === -1) return filename;
  return urlTitle(strtolower(filename.slice(0, pos))) + filename.slice(pos);
}

function sanitizeFilename(s) {
  s = removeInvisibleCharacters(s, false);
  let old;
  do {
    old = s;
    for (const bad of BAD_CHARS) s = s.split(bad).join('');
  } while (old !== s);
  return s.replace(/\\(.?)/g, '$1');
}

function setFilename(dir, filename, ext) {
  if (!fs.existsSync(path.join(dir, filename))) return filename;
  const base = filename.split(ext).join('');
  for (let i = 1; i < 100; i++) {
    if (!fs.existsSync(path.join(dir, `${base}${i}${ext}`))) return `${base}${i}${ext}`;
  }
  return false;
}

/**
 * my_upload($field, $dir) — FILES is the request's $_FILES. Moves the file into UPLOAD_DIR/<dir>/.
 */
function myUpload(FILES, field, dir) {
  const file = FILES[field];
  if (!file || typeof file.name !== 'string') return undefined;
  const uploadPath = path.join(env.uploadDir, dir);
  if (!fs.existsSync(uploadPath)) return undefined;
  if (file.error !== 0 || !file.tmp_name || !fs.existsSync(file.tmp_name)) return undefined;

  const allowed = fileExt(file.name);
  if (allowed === '') return undefined;
  const fileType = detectMime(file);
  let fileName = prepFilename(file.name);
  const ext = getExtension(fileName);
  const extNoDot = strtolower(ext.slice(1));
  if (extNoDot !== allowed) return undefined;
  if (['gif', 'jpg', 'jpeg', 'jpe', 'png'].includes(extNoDot) && !isImageReadable(file.tmp_name)) return undefined;
  const allowedMimes = mimes[extNoDot];
  if (!allowedMimes || !(Array.isArray(allowedMimes) ? allowedMimes.includes(fileType) : allowedMimes === fileType)) return undefined;

  const sizeKb = file.size > 0 ? round(file.size / 1024, 2) : file.size;
  const maxSize = num(configItem('allow.file.size'));
  if (maxSize !== 0 && sizeKb > maxSize) return undefined;

  fileName = sanitizeFilename(fileName).replace(/\s+/g, '_');
  const origName = fileName;
  fileName = setFilename(uploadPath, fileName, ext);
  if (fileName === false) return undefined;
  try {
    fs.copyFileSync(file.tmp_name, path.join(uploadPath, fileName));
  } catch (e) {
    return undefined;
  }
  const isImage = ['image/gif', 'image/jpeg', 'image/png', 'image/x-png', 'image/pjpeg'].includes(fileType);
  return {
    upload_data: {
      file_name: fileName,
      file_type: fileType,
      file_path: `${uploadPath.replace(/\\/g, '/')}/`,
      full_path: `${uploadPath.replace(/\\/g, '/')}/${fileName}`,
      raw_name: fileName.slice(0, fileName.length - ext.length),
      orig_name: origName,
      client_name: prepFilename(file.name),
      file_ext: ext,
      file_size: sizeKb,
      is_image: isImage,
    },
  };
}

module.exports = { myUpload, fileExt };
