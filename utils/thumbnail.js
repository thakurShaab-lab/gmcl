/**
 * Port of apps/helpers/thumbnail_helper.php get_image() / Image_thumb() in "R" (resize) mode:
 * creates UPLOAD_DIR/thumb_cache/thumb_<w>_<h>_<image> once (CodeIgniter Image_lib, maintain_ratio = TRUE)
 * and returns its URL; falls back to assets/developers/images/noimg1.gif like PHP.
 */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const env = require('../config/env');
const { str, num } = require('./php');

// FCROOT/assets/developers/images — shipped with this project (noimg1.gif).
const ASSET_DIR = path.join(process.env.FCROOT || path.join(__dirname, '..'), 'assets', 'developers', 'images');

/** CI_Image_lib::image_reproportion() with master_dim 'auto'. */
function reproportion(origW, origH, width, height) {
  const newWidth = Math.ceil((origW * height) / origH);
  const newHeight = Math.ceil((width * origH) / origW);
  const master = origH / origW - height / width < 0 ? 'width' : 'height';
  if (width !== newWidth && height !== newHeight) {
    if (master === 'width') height = newHeight;
    else width = newWidth;
  }
  return { width, height };
}

/** Image_thumb($thumb, 'R') — silently does nothing if the source cannot be read (PHP suppressed errors). */
async function imageThumb(sourcePath, image, w, h) {
  const target = path.join(env.uploadDir, 'thumb_cache', `thumb_${w}_${h}_${image}`);
  if (fs.existsSync(target)) return;
  try {
    const meta = await sharp(path.join(sourcePath, image)).metadata();
    const width = num(w) >= meta.width ? meta.width : num(w);
    const height = num(h) >= meta.height ? meta.height : num(h);
    const dims = reproportion(meta.width, meta.height, width, height);
    let pipeline = sharp(path.join(sourcePath, image)).resize(dims.width, dims.height, { fit: 'fill' });
    if (meta.format === 'jpeg') pipeline = pipeline.jpeg({ quality: 90 });
    if (meta.format === 'gif') pipeline = pipeline.gif();
    await pipeline.toFile(target);
  } catch (e) {
    // Missing/unsupported source or unwritable cache dir: no thumbnail, as with PHP's @-suppressed GD calls.
  }
}

/** get_image($dir, $image, $w = 50, $h = 50, 'R') */
async function getImage(ci, dir, image, w = 50, h = 50) {
  let url = `${ci.baseUrl()}assets/developers/images/noimg1.gif`;
  if (str(dir) === '') return url;
  const img = str(image);
  const sourceDir = path.join(env.uploadDir, str(dir));
  if (img !== '' && fs.existsSync(path.join(sourceDir, img))) {
    await imageThumb(sourceDir, img, w, h);
    const cache = `thumb_${w}_${h}_${img}`;
    if (fs.existsSync(path.join(env.uploadDir, 'thumb_cache', cache))) url = `${ci.baseUrl()}uploaded_files/thumb_cache/${cache}`;
  } else {
    await imageThumb(ASSET_DIR, 'noimg1.gif', w, h);
    const cache = `thumb_${w}_${h}_noimg1.gif`;
    if (fs.existsSync(path.join(env.uploadDir, 'thumb_cache', cache))) url = `${ci.baseUrl()}uploaded_files/thumb_cache/${cache}`;
  }
  return url;
}

module.exports = { getImage, reproportion };
