/** modules/api/controllers/Pages.php (class Pages extends Api_Controller) */
const fs = require('fs');
const path = require('path');
const { sql } = require('drizzle-orm');
const env = require('../config/env');
const pagesModel = require('../model/pages.model');
const productsModel = require('../model/pages.products.model');
const { getDbFieldValue, getDbSingleRow } = require('../model/common.model');
const { getContent, displaySymbol, getOrdersId, getOrderProductsId, getOrderProductsReviewId } = require('../model/helper.model');
const { str, trim, num, intval, eq, toBool, ucwords } = require('../utils/php');
const { xssClean } = require('../utils/xssClean');
const { getDateFormat, getYoutubeId, charLimiter, seoUrlTitle } = require('../utils/helpers');
const { mailNotify } = require('../utils/mailer');
const { myUpload } = require('../utils/upload');
const { setAppsNotification } = require('../utils/pushNotification');

// $this->language_id is never set on the API controller (undefined property => NULL).
const LANGUAGE_ID = null;

/** str_replace($search, $replace, $subject) for scalar strings. */
const replace = (subject, search, replacement) => str(subject).split(search).join(str(replacement));

/** str_replace(array("&nbsp;", "\n"), "", @$err_arr[0]) */
const firstValidationError = (ci) => replace(replace(ci.fv.firstError(), '&nbsp;', ''), '\n', '');

/** str_replace(NULL, '', $v): every scalar in the row becomes a string. */
const stringifyRow = productsModel.stringifyRow;

const noImagePath = (ci) => `${ci.baseUrl()}uploaded_files/products/noimg.png`;

/** Pages::valid_mobile($field) — form-validation callback (callback_valid_mobile[mobile_number]). */
function registerValidMobile(ci) {
  ci.callbacks.valid_mobile = (field) => {
    if (str(field) !== '') {
      ci.fv.setMessage('valid_mobile', `%s ${str(ci.lang('may_only_contain_number'))}`);
      return /^([0-9,\-+])+$/i.test(str(field));
    }
    return null;
  };
}

/* ======================================================================= trivial */

/** /api/pages, /api/pages/index, /api/pages/error_404 — empty methods. */
async function index() {}
async function error404() {}

/**
 * /api/pages/valid_mobile — public method with a required argument: PHP 5.6 warns and runs it with
 * $field = NULL, which does nothing (no output).
 */
async function validMobile(req) {
  req.ci.out.phpWarning('Missing argument 1 for Pages::valid_mobile()', 'controllers/Pages.php', 1548, {
    frames: [null, null, { file: 'modules/api/controllers/Pages.php', line: 1548, fn: '_error_handler' }, null, null, { file: 'index.php', line: 304, fn: 'require_once' }],
  });
}

/** /api/pages/notification_test — push "Notification Test" to user 1; no output. */
async function notificationTest(req) {
  const { ci } = req;
  await setAppsNotification(ci, 1, {
    message_title: 'Notification Test',
    message: 'This is notification test only',
    intervals: '',
    pem_file: 'pushCert_JGRider',
  });
}

/** /api/pages/clear_cache — deletes UPLOAD_DIR/thumb_cache/* */
async function clearCache(req) {
  const { ci } = req;
  const dir = path.join(env.uploadDir, 'thumb_cache');
  let files;
  try {
    files = fs.readdirSync(dir);
  } catch (e) {
    ci.exit('Unable to open folder');
  }
  for (const file of files) {
    try {
      fs.unlinkSync(path.join(dir, file));
    } catch (e) {
      // PHP's unlink() warning for entries it cannot delete (e.g. sub-directories).
      ci.out.phpWarning(`unlink(${env.uploadDir}/thumb_cache/${file}): ${e.code === 'EISDIR' || e.code === 'EPERM' ? 'Is a directory' : e.message}`, 'controllers/Pages.php', 1541);
    }
  }
  ci.out.echo('All cached data have been removed.');
}

/* ========================================================================= lists */

/** /api/pages/faq — keyword */
async function faq(req) {
  const { ci } = req;
  const rows = await pagesModel.getFaq(ci, { status: '1' });
  const data = {};
  if (rows.length) {
    data.success = 'true';
    data.res = rows;
  } else {
    data.success = 'false';
    data.error = ci.lang('no_record_found');
  }
  ci.out.json(data);
}

/** /api/pages/news — from_date, to_date (POST), search_keyword, keyword, sort_by */
async function news(req) {
  const { ci } = req;
  let err = 0;
  let errMsg = '';
  const fromDate = trim(ci.input.post('from_date', true));
  const toDate = trim(ci.input.post('to_date', true));
  const keyword = trim(ci.input.getPost('search_keyword', true));

  let where = sql`wlp.status='1'`;
  if (keyword !== '') where = sql`${where} AND (wlp.news_title LIKE ${`%${keyword}%`}) `;
  if (fromDate !== '' || toDate !== '') {
    if (fromDate !== '' && toDate !== '' && productsModel.phpCmp(fromDate, toDate) > 0) {
      err = 1;
      errMsg = 'From date should be less than to date';
    }
    const dateConds = [];
    if (fromDate !== '') dateConds.push(sql`DATE(wlp.news_date_added)>=${fromDate}`);
    if (toDate !== '') dateConds.push(sql`DATE(wlp.news_date_added)<=${toDate}`);
    where = sql`${where} AND (${sql.join(dateConds, sql` AND `)} )`;
  }

  const data = {};
  if (err === 0) {
    const rows = await pagesModel.getNews(ci, '', 0, { where });
    if (rows.length) {
      data.res = rows.map((v) => {
        v.news_date_added = getDateFormat(v.news_date_added, 1);
        return stringifyRow(v);
      });
    } else {
      err = 1;
      errMsg = 'No record founds';
    }
  }
  if (err === 1) {
    data.success = 'false';
    data.error = errMsg;
  } else {
    data.success = 'true';
  }
  data.product_image_path = `${ci.baseUrl()}uploaded_files/news`;
  data.product_no_image_path = noImagePath(ci);
  ci.out.json(data);
}

/** YouTube embed link built by news_details() / video_gallery(). */
function embedLink(source) {
  const youtubeId = getYoutubeId(source);
  let link = '';
  if (str(source) !== '') {
    link = 'https://www.youtube.com/embed/';
    const embed = youtubeId.includes('https://youtu.be/')
      ? youtubeId.split('https://youtu.be/').join('')
      : youtubeId.split('https://www.youtube.com/watch?v=').join('');
    link += embed;
  }
  return { youtubeId, link };
}

/** /api/pages/news_details — news_id (POST) */
async function newsDetails(req) {
  const { ci } = req;
  const newsId = ci.input.post('news_id');
  const res = await pagesModel.getNews(ci, 1, 0, { where: sql`wlp.news_id =${str(newsId)} ` });
  const data = {};
  if (res) {
    res.video_url = embedLink(res.video_url).link;
    res.news_date_added = getDateFormat(res.news_date_added, 1);
    data.success = 'true';
    data.res = res;
    data.media_res = await pagesModel.getNewsMedia(ci.db, res.news_id, 5);
  } else {
    data.success = 'false';
    data.error = 'Invalid news id!';
  }
  data.product_image_path = `${ci.baseUrl()}uploaded_files/news`;
  data.product_no_image_path = noImagePath(ci);
  ci.out.json(data);
}

/** /api/pages/testimonial — keyword */
async function testimonial(req) {
  const { ci } = req;
  const rows = await pagesModel.getTestimonial(ci, '', { status: '1' });
  const data = {};
  if (rows.length) {
    data.success = 'true';
    data.res = rows.map((v) => {
      v.posted_date = getDateFormat(v.posted_date, 1);
      return stringifyRow(v);
    });
  } else {
    data.success = 'false';
    data.error = ci.lang('no_record_found');
  }
  data.product_image_path = `${ci.baseUrl()}uploaded_files/testimonials`;
  data.product_no_image_path = noImagePath(ci);
  ci.out.json(data);
}

/** /api/pages/testimonial_details — testimonial_id (POST) */
async function testimonialDetails(req) {
  const { ci } = req;
  const testimonialId = ci.input.post('testimonial_id');
  const rows = await pagesModel.getTestimonial(ci, 1, { status: '1', where: sql`testimonial_id =${str(testimonialId)} ` });
  const data = {};
  if (rows.length) {
    const res = rows[0];
    res.posted_date = getDateFormat(res.posted_date, 1);
    data.success = 'true';
    data.res = res;
  } else {
    data.success = 'false';
    data.error = 'Invalid testimonial id!';
  }
  data.product_image_path = `${ci.baseUrl()}uploaded_files/testimonials`;
  data.product_no_image_path = noImagePath(ci);
  ci.out.json(data);
}

/** /api/pages/price_list */
async function priceList(req) {
  const { ci } = req;
  const rows = await pagesModel.getBrouchers(ci.db, { status: '1' });
  const data = {};
  if (rows.length) {
    data.success = 'true';
    data.res = rows;
  } else {
    data.success = 'false';
    data.error = ci.lang('no_record_found');
  }
  data.product_image_path = `${ci.baseUrl()}uploaded_files/brouchers`;
  data.product_no_image_path = noImagePath(ci);
  ci.out.json(data);
}

/** /api/pages/image_gallery — keyword, language_id */
async function imageGallery(req) {
  const { ci } = req;
  const rows = await pagesModel.getGallery(ci, { status: '1', type: '1' });
  const data = {};
  if (rows.length) {
    data.success = 'true';
    data.res = rows;
  } else {
    data.success = 'false';
    data.error = ci.lang('no_record_found');
  }
  data.product_image_path = `${ci.baseUrl()}uploaded_files/image_gallery`;
  data.product_no_image_path = noImagePath(ci);
  ci.out.json(data);
}

/** /api/pages/video_gallery — keyword, language_id */
async function videoGallery(req) {
  const { ci } = req;
  const rows = await pagesModel.getGallery(ci, { status: '1', type: '2' });
  const data = {};
  if (rows.length) {
    data.success = 'true';
    data.res = rows.map((v) => {
      const { youtubeId, link } = embedLink(v.embed_code);
      let galleryImage = noImagePath(ci);
      // strpos("$youtubeid", "Invalid") <= 0  (false <= 0 is true)
      const pos = youtubeId.indexOf('Invalid');
      if (pos <= 0) galleryImage = `https://i3.ytimg.com/vi/${youtubeId}/mqdefault.jpg`;
      v.embed_link = link;
      v.gallery_image = galleryImage;
      return stringifyRow(v);
    });
  } else {
    data.success = 'false';
    data.error = ci.lang('no_record_found');
  }
  data.product_image_path = `${ci.baseUrl()}uploaded_files/image_gallery`;
  data.product_no_image_path = noImagePath(ci);
  ci.out.json(data);
}

/** /api/pages/services */
async function services(req) {
  const { ci } = req;
  const rows = await pagesModel.getServicePages(ci.db);
  const data = {};
  if (rows.length) {
    data.success = 'true';
    data.res = rows.map((v) => {
      v.page_description = charLimiter(v.page_description, 55);
      return stringifyRow(v);
    });
  } else {
    data.success = 'false';
    data.error = 'No records found';
  }
  data.product_image_path = `${ci.baseUrl()}uploaded_files/userfiles`;
  data.product_no_image_path = noImagePath(ci);
  ci.out.json(data);
}

/** /api/pages/services_details — page_id (POST) */
async function servicesDetails(req) {
  const { ci } = req;
  const data = {};
  if (toBool(ci.input.post('page_id'))) {
    const pageId = ci.input.post('page_id');
    data.content = await pagesModel.getCmsPage(ci.db, { page_id: pageId, status: '1' });
    data.success = 'true';
  } else {
    data.error = 'Invalid Id';
    data.success = 'false';
  }
  data.product_image_path = `${ci.baseUrl()}uploaded_files/userfiles`;
  data.product_no_image_path = noImagePath(ci);
  ci.out.json(data, false);
}

/* ===================================================================== CMS pages */

const CMS_PAGE_NAMES = {
  aboutus: 'aboutus',
  catalog: 'catalog',
  gallery: 'gallery',
  bone_china_design: 'bone-china-design',
  privacy_policy: 'privacy-policy',
  terms_conditions: 'terms-conditions',
};

/** /api/pages/cms_pages — page_name */
async function cmsPages(req) {
  const { ci } = req;
  const pageName = ci.input.getPost('page_name');
  let friendlyUrl = 'aboutus';
  for (const [name, url] of Object.entries(CMS_PAGE_NAMES)) {
    if (eq(pageName, name)) {
      friendlyUrl = url;
      break;
    }
  }
  const data = {};
  data.content = await pagesModel.getCmsPage(ci.db, { friendly_url: friendlyUrl, status: '1' });
  data.success = 'true';
  ci.out.json(data, false);
}

/** aboutus, catalog (no strip_tags) and gallery, bone_china_design, ... (strip_tags) */
function cmsPage(friendlyUrl, stripTag) {
  return async (req) => {
    const { ci } = req;
    const data = {};
    data.content = await pagesModel.getCmsPage(ci.db, { friendly_url: friendlyUrl, status: '1' });
    data.success = 'true';
    if (stripTag) ci.out.json(data);
    else ci.out.json(data, false);
  };
}

/** /api/pages/how_to_buy — get_cms_page() was called with a string, so it returned nothing. */
async function howToBuy(req) {
  const { ci } = req;
  ci.out.json({ content: null, success: 'true' });
}

/* ======================================================================= writes */

/** /api/pages/refer_to_friends — POST action=refer, friend_name, friend_email, friend_mobile, products_id (user token) */
async function referToFriends(req) {
  const { ci } = req;
  const productId = ci.input.post('products_id');
  let data = {};
  if (ci.input.server('REQUEST_METHOD') === 'POST') {
    if (eq(ci.input.getPost('action'), 'refer')) {
      const userPostId = ci.userId;
      if (num(userPostId) > 0) {
        // PHP looked the member up with an undefined variable ($mem_res), i.e. customers_id = ''.
        const memRes = await getDbSingleRow(ci.db, 'wl_customers', 'first_name,user_name', { customers_id: null }, ci.out);
        registerValidMobile(ci);
        ci.fv.setRules('friend_name', "Friend's Name", 'trim|required|alpha|max_length[100]');
        ci.fv.setRules('friend_email', "Friend's Email", 'trim|required|valid_email|max_length[100]');
        ci.fv.setRules('friend_mobile', "Friend's Mobile", 'trim|required|min_length[10]|max_length[10]|callback_valid_mobile[mobile_number]');
        if (await ci.fv.run()) {
          const yourName = memRes ? memRes.first_name : null;
          const yourEmail = memRes ? memRes.user_name : null;
          const friendName = ci.input.post('friend_name', true);
          const friendEmail = ci.input.post('friend_email', true);
          const friendMobile = ci.input.post('friend_mobile', true);

          const count = await pagesModel.countInvites(ci.db, yourEmail, friendEmail);
          if (!count) {
            const posted = xssClean(
              {
                your_name: yourName,
                your_email: yourEmail,
                friend_name: friendName,
                friend_email: friendEmail,
                friend_mobile: friendMobile,
                receive_date: ci.config('config.date.time'),
              },
              ci.requestUri,
            );
            await pagesModel.insertInvite(ci.db, posted);
          }

          const content = await getContent(ci.db, 'wl_auto_respond_mails', '3');
          let body = content ? content.email_content : null;
          let linkUrl;
          let text;
          let message;
          if (num(productId) > 0) {
            const productLinkUrl = await pagesModel.getProductFriendlyUrl(ci.db, productId);
            linkUrl = `<a href=${ci.baseUrl()}${str(productLinkUrl)}>Click here </a>`;
            text = 'Product';
            message = ci.config('product_referred_success');
          } else {
            linkUrl = `<a href=${ci.baseUrl()}>Click here </a>`;
            text = 'Site';
            message = ci.config('site_referred_success');
          }
          body = replace(body, '{friend_name}', friendName);
          body = replace(body, '{your_name}', yourName);
          body = replace(body, '{site_name}', ci.config('site_name'));
          body = replace(body, '{text}', text);
          body = replace(body, '{site_link}', linkUrl);
          mailNotify({
            subject: `Invitation from ${str(yourName)} to see`,
            to_email: friendEmail,
            from_email: yourEmail,
            from_name: yourName,
            body_part: body,
          });
          data.message = message;
          data.success = 'true';
        } else {
          data = { success: 'false', error: firstValidationError(ci) };
        }
      } else {
        data.success = 'false';
        data.error = 'Please login first!';
      }
    } else {
      data.success = 'false';
      data.error = 'Parameter Missing';
    }
  } else {
    data.success = 'false';
    data.error = 'Request method does not allow';
  }
  ci.out.json(data);
}

/** /api/pages/post_testimonial — POST action=testimonial, email, poster_name, testimonial_description, testimonial_image (file) */
async function postTestimonial(req) {
  const { ci } = req;
  let data = {};
  if (ci.input.server('REQUEST_METHOD') === 'POST') {
    if (eq(ci.input.getPost('action'), 'testimonial')) {
      const imgAllowSize = ci.config('allow.file.size');
      const imgAllowDim = ci.config('allow.imgage.dimension');
      ci.fv.setRules('email', 'Email', 'trim|required|valid_email|max_length[80]');
      ci.fv.setRules('poster_name', 'Name', 'trim|required|alpha|max_length[30]');
      ci.fv.setRules('testimonial_image', 'Image', `file_allowed_type[image]|file_size_max[${str(imgAllowSize)}]|check_dimension[${str(imgAllowDim)}]`);
      ci.fv.setRules('testimonial_description', 'Description', 'trim|required|max_length[8500]');
      if (await ci.fv.run()) {
        let testimonialImage = '';
        const file = ci.FILES.testimonial_image;
        if (Object.keys(ci.FILES).length && file && str(file.name) !== '') {
          const uploaded = myUpload(ci.FILES, 'testimonial_image', 'testimonials');
          if (uploaded) testimonialImage = uploaded.upload_data.file_name;
        }
        const testimonialId = await pagesModel.insertTestimonial(ci.db, {
          poster_name: ci.input.post('poster_name'),
          testimonial_image: testimonialImage,
          email: ci.input.post('email'),
          testimonial_description: ci.input.post('testimonial_description'),
          posted_date: ci.config('config.date.time'),
        });
        const friendlyUrl = seoUrlTitle(`${str(ci.input.post('poster_name'))}-${str(testimonialId)}`);
        await pagesModel.updateTestimonialUrl(ci.db, testimonialId, friendlyUrl);
        // The meta array (get_text()/get_keywords()) was built but never used (create_meta() is commented out).

        let message = ci.config('testimonial_post_success');
        message = replace(message, '<site_name>', ci.config('site_name'));
        data.message = message;
        data.success = 'true';
      } else {
        data = { success: 'false', error: firstValidationError(ci) };
      }
    } else {
      data.success = 'false';
      data.error = 'Parameter Missing';
    }
  } else {
    data.success = 'false';
    data.error = 'Request method does not allow';
  }
  ci.out.json(data);
}

/** /api/pages/post_newsletter — POST action=post_newsletter, name, email */
async function postNewsletter(req) {
  const { ci } = req;
  let data = {};
  if (ci.input.server('REQUEST_METHOD') === 'POST') {
    if (eq(ci.input.getPost('action'), 'post_newsletter')) {
      ci.fv.setRules('name', 'Name', 'trim|alpha|required|max_length[32]');
      ci.fv.setRules('email', 'Email Id', 'trim|required|valid_email|max_length[100]');
      if (await ci.fv.run()) {
        const subscribed = await pagesModel.isSubscribed(ci.db, ci.input.post('email', true));
        if (!subscribed) {
          const subscriberName = ci.input.post('name', true);
          const newsletter = xssClean(
            {
              subscriber_email: ci.input.post('email', true),
              subscriber_name: subscriberName,
              subscribe_date: ci.config('config.date.time'),
              status: '1',
            },
            ci.requestUri,
          );
          await pagesModel.insertNewsletter(ci.db, newsletter);
          data.message = ci.config('newsletter_subscribed');
          data.success = 'true';
        } else {
          data.error = ci.config('newsletter_already_subscribed');
          data.success = 'false';
        }
      } else {
        data = { success: 'false', error: firstValidationError(ci) };
      }
    } else {
      data.success = 'false';
      data.error = 'Parameter Missing';
    }
  } else {
    data.success = 'false';
    data.error = 'Request method does not allow';
  }
  ci.out.json(data);
}

/** /api/pages/contactus — POST action=contactus, first_name, last_name, email, mobile_number, comment */
async function contactus(req) {
  const { ci } = req;
  let data = {};
  if (ci.input.server('REQUEST_METHOD') === 'POST') {
    if (eq(ci.input.getPost('action'), 'contactus')) {
      registerValidMobile(ci);
      ci.fv.setRules('first_name', 'First Name', 'trim|alpha|required|max_length[100]');
      ci.fv.setRules('last_name', 'Last Name', 'trim|alpha|max_length[100]');
      ci.fv.setRules('email', 'Email Id', 'trim|required|valid_email|max_length[100]');
      ci.fv.setRules('mobile_number', 'Mobile Number', 'trim|required|min_length[10]|max_length[10]|callback_valid_mobile[mobile_number]');
      ci.fv.setRules('comment', 'Enquiry/Comment', 'trim|required|max_length[8500]');
      if (await ci.fv.run()) {
        const posted = xssClean(
          {
            first_name: ci.input.post('first_name', true),
            last_name: ci.input.post('last_name', true),
            email: ci.input.post('email', true),
            mobile_number: ci.input.post('mobile_number', true),
            company_name: '',
            country: '',
            message: ci.input.post('comment', true),
            receive_date: ci.config('config.date.time'),
          },
          ci.requestUri,
        );
        await pagesModel.insertEnquiry(ci.db, posted);

        const admin = await ci.adminInfo();
        const adminEmail = admin ? admin.admin_email : null;
        const siteName = ci.config('site_name');
        const content = await getContent(ci.db, 'wl_auto_respond_mails', '5');
        const subject = replace(content ? content.email_subject : null, '{site_name}', siteName);
        const verifyUrl = `<a href=${ci.baseUrl()}>Click here </a>`;
        const senderName = ucwords(`${str(ci.input.post('first_name', true))} ${str(ci.input.post('last_name', true))}`);
        const fill = (name, sender) => {
          let body = content ? content.email_content : null;
          body = replace(body, '{mem_name}', name);
          body = replace(body, '{sender_name}', sender);
          body = replace(body, '{email}', ci.input.post('email', true));
          body = replace(body, '{mobile}', ci.input.post('mobile_number', true));
          body = replace(body, '{comments}', ci.input.post('message', true));
          body = replace(body, '{admin_email}', adminEmail);
          body = replace(body, '{site_name}', siteName);
          body = replace(body, '{url}', ci.baseUrl());
          body = replace(body, '{link}', verifyUrl);
          return body;
        };
        // Mail to the user
        mailNotify({ subject, to_email: ci.input.post('email', true), from_email: adminEmail, from_name: siteName, body_part: fill(senderName, senderName) });
        // Mail to the admin
        mailNotify({ subject, to_email: adminEmail, from_email: adminEmail, from_name: siteName, body_part: fill('Admin', senderName) });

        data.message = ci.lang('enquiry_has_been_submitted');
        data.success = 'true';
      } else {
        data = { success: 'false', error: firstValidationError(ci) };
      }
    } else {
      data.success = 'false';
      data.error = 'Parameter Missing';
    }
  } else {
    data.success = 'false';
    data.error = 'Request method does not allow';
  }
  ci.out.json(data);
}

/** /api/pages/update_keys — wl_keys, device_id (POST); prints nothing unless both are given. */
async function updateKeys(req) {
  const { ci } = req;
  const keys = ci.input.post('wl_keys');
  const deviceId = ci.input.post('device_id');
  if (str(deviceId) !== '' && str(keys) !== '') {
    const isValid = await pagesModel.findApiAccess(ci.db, deviceId);
    if (isValid) await pagesModel.updateApiAccess(ci.db, deviceId, keys);
    else await pagesModel.insertApiAccess(ci.db, deviceId, keys);
    ci.out.json({ success: 'true', message: 'Key has been update successfully.' });
  }
}

/* ====================================================================== home page */

/** /api/pages/banner_list — home page payload (keyword/status filter categories; keyword2/search_prod_type/sortby filter products) */
async function bannerList(req) {
  const { ci } = req;
  const data = {};
  data.currency_code = await getDbFieldValue(ci.db, 'wl_currencies', 'code', { is_default: 'Y' });
  data.currency_symbol_left = await displaySymbol(ci.db);

  const userId = ci.userId;
  const wish = { wish_user_id: userId };

  let proRes4 = [];
  if (num(userId) > 0) {
    const ordersIds = await getOrdersId(ci.db, userId);
    if (ordersIds !== '') {
      const productsIds = await getOrderProductsReviewId(ci.db, ordersIds, userId);
      if (productsIds !== '') {
        const rows = await productsModel.getProducts(ci, '8', '0', {
          status: '1',
          orderby: 'products_id DESC',
          where: sql`wlp.products_id IN (${productsIds}) `,
          ...wish,
        });
        if (rows.length) proRes4 = await productsModel.decorateProducts(ci, rows, { withRating: true });
      }
    }
  }

  const catRows = await productsModel.getCategoryList(ci, {
    field: `a.category_id,category_name,category_image,parent_id,( SELECT COUNT(category_id) FROM wl_categories AS b
		WHERE b.parent_id=a.category_id ) AS total_subcategories`,
    condition: sql`AND parent_id = '0' AND status='1' `,
    limit: '6',
    offset: 0,
    order: 'sort_order ASC ',
  });
  const catRes = catRows
    ? catRows.map((v) => {
        v.category_name = charLimiter(v.category_name, 10);
        return stringifyRow(v);
      })
    : [];

  const banTop = (await pagesModel.getBanners(ci.db, 'Home Page Top')) || [];

  const productBlock = async (where) => {
    const param = { status: '1', orderby: 'products_id DESC', ...wish };
    if (where) param.where = where;
    const rows = await productsModel.getProducts(ci, '4', '0', param);
    return rows.length ? productsModel.decorateProducts(ci, rows) : [];
  };

  const proRes = await productBlock(sql`wlp.is_featured = '1'`);
  const banMiddle = (await pagesModel.getBanners(ci.db, 'Home Page Middle')) || [];
  const proRes1 = await productBlock(sql`wlp.is_trending = '1'`);
  const proRes2 = await productBlock(null);
  const banBottom = (await pagesModel.getBanners(ci.db, 'Home Page Bottom')) || [];

  let proRes3 = [];
  if (num(userId) > 0) {
    const ordersIds = await getOrdersId(ci.db, userId);
    if (num(ordersIds) > 0) {
      const productsIds = await getOrderProductsId(ci.db, ordersIds);
      if (productsIds !== '') {
        const ids = sql.join(
          productsIds.split(',').map((id) => sql`${id}`),
          sql`,`,
        );
        const rows = await productsModel.getProducts(ci, '10', '0', {
          status: '1',
          orderby: 'products_id DESC',
          where: sql`wlp.products_id IN (${ids}) `,
          ...wish,
        });
        if (rows.length) proRes3 = await productsModel.decorateProducts(ci, rows);
      }
    }
  }

  const block = (title, result) => ({ result_type: title, title, result });
  data.success = 'true';
  data.all_res = [
    block('Waiting For Review', proRes4),
    block('Categories', catRes),
    block('Banner Top', banTop),
    block('Featured Products', proRes),
    block('Banner Middle', banMiddle),
    block('Trending Products', proRes1),
    block('Newly Added Product', proRes2),
    block('Banner Bottom', banBottom),
    block('Previous Orders', proRes3),
  ];
  const admin = await ci.adminInfo();
  data.whatsapp_no = admin ? admin.whats_app_no : null;
  data.whatsapp_message = admin ? admin.whats_app_message : null;
  data.category_image_path = `${ci.baseUrl()}uploaded_files/category`;
  data.image_path = `${ci.baseUrl()}uploaded_files/banner`;
  data.product_image_path = `${ci.baseUrl()}uploaded_files/products`;
  data.product_no_image_path = noImagePath(ci);
  ci.out.json(data);
}

/**
 * /api/pages/search_list — keyword. The category query uses wl_categories_lang and the product query was built
 * with $fields = $this->language_id (NULL), i.e. "SELECT SQL_CALC_FOUND_ROWS ,wlp.status ..." — a SQL syntax
 * error — so with a keyword PHP always ended on a database error; the code after it was unreachable.
 */
async function searchList(req) {
  const { ci } = req;
  const keyword = trim(ci.input.getPost('keyword', true));
  if (keyword !== '') {
    await pagesModel.searchCategories(ci.db, keyword, LANGUAGE_ID);
    await productsModel.getProducts(
      ci,
      '10',
      '0',
      {
        status: '1',
        where: sql` (wlp_lang.product_name LIKE ${`%${keyword}%`} OR wlp.product_code LIKE ${`%${keyword}%`} ) `,
        orderby: 'rand()',
      },
      str(LANGUAGE_ID),
    );
    // Unreachable in PHP (the query above always fails).
    throw new Error('search_list: unreachable');
  }
  ci.out.json({ success: 'false', error: 'Parameter Missing' });
}

/* ===================================================================== misc reads */

/** /api/pages/admin_details */
async function adminDetails(req) {
  const { ci } = req;
  const adminRes = await getDbSingleRow(ci.db, 'tbl_admin', 'facebook_link,instagram_link,website_link', sql` and admin_id=1 `, ci.out);
  const data = {};
  if (adminRes) {
    data.success = 'true';
    data.admin_res = adminRes;
  } else {
    data.success = 'false';
    data.error = 'parameter missing';
  }
  ci.out.json(data);
}

/** /api/pages/get_cities */
async function getCities(req) {
  const { ci } = req;
  const rows = await pagesModel.getCities(ci.db);
  ci.out.json(rows ? { success: 'true', cities: rows } : { success: 'false', error: 'parameter missing' });
}

/** /api/pages/get_locations — city_id */
async function getLocations(req) {
  const { ci } = req;
  const cityId = intval(ci.input.getPost('city_id'));
  let data;
  if (cityId > 0) {
    const rows = await pagesModel.getLocations(ci.db, cityId, LANGUAGE_ID);
    data = rows ? { success: 'true', locations: rows, total_records: rows.length } : { success: 'false', error: 'no record found' };
  } else {
    data = { success: 'false', error: 'parameter missing' };
  }
  ci.out.json(data);
}

/** /api/pages/get_slots */
async function getSlots(req) {
  const { ci } = req;
  const rows = await pagesModel.getSlots(ci.db, LANGUAGE_ID);
  ci.out.json(rows ? { success: 'true', slots: rows } : { success: 'false', error: 'parameter missing' });
}

/** /api/pages/reason */
async function reason(req) {
  const { ci } = req;
  const rows = await pagesModel.getReasons(ci.db, LANGUAGE_ID);
  ci.out.json(rows ? { success: 'true', slots: rows } : { success: 'false', error: 'parameter missing' });
}

module.exports = {
  index,
  error404,
  validMobile,
  notificationTest,
  clearCache,
  faq,
  news,
  newsDetails,
  testimonial,
  testimonialDetails,
  priceList,
  imageGallery,
  videoGallery,
  services,
  servicesDetails,
  cmsPages,
  aboutus: cmsPage('aboutus', false),
  catalog: cmsPage('catalog', false),
  gallery: cmsPage('gallery', true),
  boneChinaDesign: cmsPage('bone-china-design', true),
  privacyPolicy: cmsPage('privacy-policy', true),
  termsConditions: cmsPage('terms-conditions', true),
  ourScience: cmsPage('our-science', true),
  ourPeople: cmsPage('our-people', true),
  returnPolicy: cmsPage('return-policy', true),
  howToBuy,
  referToFriends,
  postTestimonial,
  postNewsletter,
  contactus,
  updateKeys,
  bannerList,
  searchList,
  adminDetails,
  getCities,
  getLocations,
  getSlots,
  reason,
};
