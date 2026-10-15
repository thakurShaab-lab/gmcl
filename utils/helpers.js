/** Pure (non-database) helpers from apps/helpers/*.php and modules/api/helpers/api_helper.php. */
const { phpDate, strtotime, str, trim, strlen, substr, rand } = require('./php');
const { stripTags } = require('./phpJson');

/** utils_helper getDateFormat($date, $format, $seperator1 = ","); null for an unknown format (PHP: undefined var). */
function getDateFormat(date, format, sep = ',') {
  const ts = strtotime(date);
  const t = ts === false ? 0 : ts;
  const formats = {
    1: `d M${sep} Y`,
    2: `d F${sep} Y`,
    3: `D M d${sep} Y`,
    4: `l F d${sep} Y`,
    5: `l F d${sep} Y${sep} h:i:s`,
    6: `l F d${sep} Y${sep} H:i A`,
    7: `d M${sep} Y${sep} H:i A`,
    8: `d M${sep} Y${sep} h:i`,
    9: `M d${sep} Y [l]`,
    10: 'F Y',
    11: 'd',
  };
  const f = formats[Number(format)];
  return f === undefined ? null : phpDate(f, t);
}

/** utils_helper get_Youtube_Id($source) */
function getYoutubeId(source) {
  source = trim(source);
  if (strlen(source) === 11) return source;
  const p1 = /(?:youtube\.com\/(?:user\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?/ ]{11})/i;
  const p2 = /http:\/\/www.youtube.com\/v\/([A-Za-z0-9\-_]+).+?|embed\/([0-9A-Za-z-_]{11})|watch\?v=([0-9A-Za-z-_]{11})|#.*\/([0-9A-Za-z-_]{11})/is;
  let m = source.match(p1);
  if (m) return m[1];
  m = source.match(p2);
  if (m) {
    for (let i = 1; i <= 4; i++) if (m[i] !== undefined && strlen(m[i]) === 11) return m[i];
    return '';
  }
  return 'An Invalid YoutubeId extracted';
}

/** utils_helper char_limiter($str, $len, $suffix = '...') — byte based like strlen/substr. */
function charLimiter(input, len, suffix = '...') {
  let s = stripTags(str(input));
  if (strlen(s) > len) s = substr(s, 0, len) + suffix;
  return s;
}

/** api_helper genrate_token(): 47 random characters from the PHP alphabet. */
function genrateToken() {
  const chars = 'bcdfghjkmnpqrstvzBCDFGHJKLMNPQRSTVWXZaeiouyAEIOUY!@#%';
  let token = '';
  for (let i = 0; i < 47; i++) token += chars[rand(0, 2147483647) % chars.length];
  return token;
}

/** utils_helper applyFilter($type, $val) */
function applyFilter(type, val) {
  if (type === 'NUMERIC_GT_ZERO') {
    const v = trim(val).replace(/^0*/, '');
    return /^[1-9][0-9]*$/i.test(v) ? v : 0;
  }
  if (type === 'NUMERIC_WT_ZERO') return /^[0-9]*$/i.test(trim(val)) ? val : -1;
  return null;
}

/** api_helper / seo_helper seo_url_title($str) */
function seoUrlTitle(input) {
  let s = str(input).replace(/[^a-zA-Z0-9-_/]/g, '-');
  s = s.replace(/[/]{2,15}/g, '/');
  s = s.replace(/[-]{2,15}/g, '-');
  s = s.split('/').join('');
  s = s.split('--').join('-');
  s = s.split('--').join('-');
  s = s.toLowerCase();
  return trim(s, '-');
}

module.exports = { getDateFormat, getYoutubeId, charLimiter, genrateToken, applyFilter, seoUrlTitle };
