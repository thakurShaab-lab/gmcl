/** modules/api/controllers/User.php (class User extends Api_Controller) */
const userModel = require('../model/user.model');
const safeEncrypt = require('../utils/safeEncrypt');
const { mailNotify } = require('../utils/mailer');
const { myUpload } = require('../utils/upload');
const { genrateToken } = require('../utils/helpers');
const { xssClean } = require('../utils/xssClean');
const { str, eq, neq, toBool, num, intval, md5, ucfirst, ucwords, randomString } = require('../utils/php');

const FILE = 'modules/api/controllers/User.php';

/**
 * PHP 5.6 "Missing argument N for User::x()" warning. The shared ci.out.missingArguments() renders one empty
 * backtrace frame too many for this warning (it is raised on method entry), so the frames are given here.
 */
function missingArgument(ci, fn, line) {
  ci.out.phpWarning(`Missing argument 1 for ${fn}()`, 'controllers/User.php', line, {
    frames: [null, null, { file: FILE, line, fn: '_error_handler' }, null, null, { file: 'index.php', line: 304, fn: 'require_once' }],
  });
}
const POST_ONLY = ['login', 'register', 'otp', 'resend', 'index', 'forgotten_password', 'face_authotication', 'guest_login'];

/** str_replace(array("&nbsp;", "\n"), "", $x) */
const stripNbsp = (x) => str(x).split('&nbsp;').join('').split('\n').join('');

/** PHP str_replace($search, $replace, $subject) for one scalar pair. */
const replace = (subject, search, replacement) => str(subject).split(search).join(str(replacement));

/** @str_replace(array("&nbsp;", "\n"), "", @array_values(web_service_validation_errors_list())[0]) */
const firstValidationError = (ci) => stripNbsp(ci.fv.firstError());

/** PHP 7 `$x > 0` for request input (arrays are always greater than an int). */
const gtZero = (v) => (v === null || v === undefined ? false : typeof v === 'object' ? true : num(v) > 0);

/** String interpolation of request input ("Array" for arrays). */
const interp = (v) => (v !== null && typeof v === 'object' ? 'Array' : str(v));

/** strpos($x, '@') > 0 */
const atAfterStart = (v) => str(v).indexOf('@') > 0;

/** site_url($uri) (index_page and url_suffix are empty) */
const siteUrl = (ci, uri) => `${ci.baseUrl()}${uri}`;

/**
 * Constructor: form-validation delimiters, then the POST-only guard keyed on the raw (case-sensitive)
 * third URI segment.
 */
async function construct(ci) {
  ci.fv.setErrorDelimiters("<div class='required'>", '</div>');
  ci.callbacks.valid_mobile = (field) => validMobileCallback(ci, field);
  ci.callbacks.email_check = () => emailCheckCallback(ci);
  ci.callbacks.mobile_check = () => mobileCheckCallback(ci);
  const seg = ci.segment(3);
  if (seg !== null && POST_ONLY.includes(seg) && ci.input.server('REQUEST_METHOD') !== 'POST') {
    ci.out.json({ success: 'false', error: ci.lang('request_method_does_not_allow') });
    ci.exit();
  }
}

/* --------------------------------------------------------------- callbacks */

function validMobileCallback(ci, field) {
  if (neq(field, '')) {
    ci.fv.setMessage('valid_mobile', `%s ${str(ci.lang('may_only_contain_number'))}`);
    return /^([0-9,\-+])+$/i.test(str(field));
  }
  return null;
}

async function emailCheckCallback(ci) {
  const email = ci.input.post('email');
  if (await userModel.isEmailExists(ci.db, 'user_name', email)) {
    ci.fv.setMessage('email_check', ci.config('exists_user_id'));
    return false;
  }
  return true;
}

async function mobileCheckCallback(ci) {
  const mobile = ci.input.post('mobile_number');
  if (neq(mobile, '')) {
    if (/^([0-9,\-+])+$/i.test(str(mobile))) {
      if (await userModel.isEmailExists(ci.db, 'mobile_number', mobile)) {
        ci.fv.setMessage('mobile_check', ci.lang('mobile_number_already_exist'));
        return false;
      }
    } else {
      ci.fv.setMessage('mobile_check', `%s ${str(ci.lang('may_only_contain_number'))}`);
      return false;
    }
  }
  return true;
}

/* --------------------------------------------------------------- shared steps */

/** Token lookup + insert, or expiry of the app's other tokens. Returns the token. */
async function issueToken(ci, userId, { loginType = null, provider, insertLoginType = null }) {
  const appType = ci.input.post('app_type');
  const appId = ci.input.post('app_id');
  let token = await userModel.findActiveToken(ci.db, { userId, appType, appId, loginType, provider });
  if (eq(token, '')) {
    token = genrateToken();
    const row = { token, user_id: userId, app_type: appType, app_id: appId, created_at: ci.config('config.date.time') };
    if (insertLoginType !== null) row.login_type = insertLoginType;
    row.provider = provider;
    await userModel.insertToken(ci.db, row);
  } else {
    await userModel.expireOtherTokens(ci.db, { now: ci.config('config.date.time'), appId, token, provider });
  }
  return token;
}

/** The four get_db_field_value('wl_currencies', ...) calls; only code and symbol_left are used. */
async function currency(ci) {
  const code = await userModel.defaultCurrencyField(ci.db, 'code');
  const symbolLeft = await userModel.defaultCurrencyField(ci.db, 'symbol_left');
  return { code, symbolLeft };
}

/* --------------------------------------------------------------- endpoints */

/** /api/user, /api/user/index → login() */
async function index(req, res) {
  return login(req, res);
}

/** POST /api/user/face_authotication — user_image (file), device_id, app_id, app_type */
async function faceAuthotication(req, res) {
  const { ci } = req;
  const allowSize = ci.config('allow.file.size');
  ci.fv.setRules('user_image', ci.lang('image'), `required_file|file_size_max[${str(allowSize)}]`);
  ci.fv.setRules('device_id', ci.lang('device_id'), 'required');
  ci.fv.setRules('app_id', ci.lang('app_id'), 'required');
  ci.fv.setRules('app_type', ci.lang('app_type'), 'required');

  let data = {};
  if (await ci.fv.run()) {
    const userData = await userModel.findFaceCustomer(ci.db, ci.input.post('device_id'));
    if (userData) {
      const userId = userData.customers_id;
      if (userData.status === '0') {
        data.error = ci.lang('login_failed_your_account_has_been_deactivated_please_contact_to_admin');
        data.success = 'false';
      } else if (userData.is_verified_mobile === '0') {
        data.message = ci.lang('login_failed_please_verify_your_account_with_otp');
        data.status = 'true';
        data.mobile_verification = 'true';
        const verifyCode = randomString('numeric', 4);
        await userModel.safeUpdate(ci.db, 'wl_customers', { verify_code: verifyCode }, { customers_id: userId });
        data.otp_code = verifyCode;
        data.mobile_number = userData.mobile_number;
      } else if (eq(userData.customer_photo, '')) {
        data.error = 'You have not update your photo.';
        data.success = 'false';
      } else {
        // $user_data['is_face_authentication'] is not selected (null), so its "== '0'" check never matches.
        let userImage = null;
        const file = ci.FILES.user_image;
        if (Object.keys(ci.FILES).length > 0 && file && neq(file.name, '')) {
          const uploaded = myUpload(ci.FILES, 'user_image', 'temp');
          if (uploaded) userImage = uploaded.upload_data.file_name;
        }
        if (neq(userImage, '')) {
          // new RekognitionClient($options): the AWS SDK is not loaded in the PHP project.
          ci.out.fatalError("Class 'RekognitionClient' not found", FILE, 114);
        } else {
          data.success = 'false';
          data.error = ci.lang('login_failed');
        }
      }
    } else {
      data.success = 'false';
      data.error = ci.lang('login_failed');
    }
  } else {
    data = { success: 'false', error: firstValidationError(ci) };
  }
  ci.out.json(data);
}

/** POST /api/user/login — user_name (email or mobile), password, device_id, app_id, app_type */
async function login(req, res) {
  const { ci } = req;
  let usName = 0;
  const rawUserName = ci.input.post('user_name');
  if (eq(rawUserName, '')) {
    ci.fv.setRules('user_name', ci.lang('username'), 'required|valid_email');
  } else if (atAfterStart(rawUserName)) {
    ci.fv.setRules('user_name', ci.lang('email'), 'trim|required|valid_email');
    usName = 1;
  } else {
    ci.fv.setRules('user_name', ci.lang('mobile_number'), 'trim|required|min_length[10]|max_length[10]|callback_valid_mobile[mobile_number]');
    usName = 2;
  }
  ci.fv.setRules('password', ci.lang('password'), 'required');
  ci.fv.setRules('device_id', ci.lang('device_id'), 'required');
  ci.fv.setRules('app_id', ci.lang('app_id'), 'required');
  ci.fv.setRules('app_type', ci.lang('app_type'), 'required');

  let data = {};
  if (await ci.fv.run()) {
    const username = ci.input.post('user_name');
    const password = ci.input.post('password');
    const userData = await userModel.verifyUser(ci, username, password);
    const userId = userData ? userData.user_id : null;

    if (userData) {
      await userModel.safeUpdate(
        ci.db,
        'wl_customers',
        { device_id: ci.input.post('device_id'), app_id: ci.input.post('app_id'), app_type: ci.input.post('app_type') },
        { customers_id: userId },
      );
      if (userData.status === '0') {
        data.error = 'Your account needs to be verified by admin.';
        data.success = 'false';
        if (userData.is_verified_mobile === '0') {
          data.mobile_verification = 'true';
          data.mobile_number = userData.mobile_number;
        } else {
          data.mobile_verification = 'false';
        }
      } else if (userData.is_verified_mobile === '0') {
        data.error = 'Login failed. Please verify your account with otp.';
        data.success = 'false';
        data.mobile_verification = 'true';
        data.mobile_number = userData.mobile_number;
      } else {
        const token = await issueToken(ci, userId, { loginType: '0', provider: 'user' });
        const cur = await currency(ci);
        data.currency_code = cur.code;
        data.currency_symbol = cur.symbolLeft;
        data.token = token;
        data.user_id = userId;
        data.login_type = '0';
        data.customer_type = userData.customer_type;
        data.success = 'true';
        data.message = 'Login successfully.';
        data.first_name = userData.first_name;
        data.last_name = userData.last_name;
        data.mobile_number = userData.mobile_number;
        data.user_email = userData.username;
      }
    } else {
      data.success = 'false';
      data.mobile_verification = 'false';
      if (usName === 1) {
        await userModel.customerFieldNotDeleted(ci.db, 'user_name', ci.input.post('user_name'));
        data.error = ci.lang('sorry_we_could_not_log_you_in_your_email_or_password');
      } else if (usName === 2) {
        const found = await userModel.customerFieldNotDeleted(ci.db, 'mobile_number', ci.input.post('user_name'));
        data.error = neq(found, '')
          ? ci.lang('sorry_we_could_not_log_you_in_your_mobile_number_or_password')
          : ci.lang('there_is_no_account_registered_with_that_mobile_number');
      } else {
        data.error = ci.lang('login_failed');
      }
    }
    const cur = await currency(ci);
    data.currency_code = cur.code;
    data.currency_symbol_left = cur.symbolLeft;
  } else {
    data = { success: 'false', mobile_verification: 'false', error: firstValidationError(ci) };
  }
  const admin = await ci.adminInfo();
  data.support_email = admin ? admin.admin_email : null;
  ci.out.json(data);
}

/** Forgot-password mail (wl_auto_respond_mails id 2). */
async function sendPasswordMail(ci, res, adminInfo, siteName) {
  const firstName = ucfirst(`${str(res.first_name)} ${str(res.last_name)}`);
  const email = res.user_name;
  const password = safeEncrypt.decode(res.password);
  const content = await require('./../model/helper.model').getContent(ci.db, 'wl_auto_respond_mails', '2');
  const subject = content ? content.email_subject : null;
  let body = content ? content.email_content : null;
  const name = `${firstName} `;
  const adminEmail = adminInfo ? adminInfo.admin_email : null;
  body = replace(body, '{mem_name}', name);
  body = replace(body, '{username}', email);
  body = replace(body, '{password}', password);
  body = replace(body, '{admin_email}', adminEmail);
  body = replace(body, '{site_name}', siteName);
  body = replace(body, '{url}', ci.baseUrl());
  body = replace(body, '{link}', '');
  mailNotify({ subject, to_email: email, from_email: adminEmail, from_name: siteName, body_part: body });
}

/** POST /api/user/forgotten_password — action=forgotten_password, user_name (email or 8-digit mobile) */
async function forgottenPassword(req, res) {
  const { ci } = req;
  const adminInfo = await userModel.adminRow(ci);
  const userName = ci.input.post('user_name', true);
  let data = {};
  if (eq(ci.input.post('action'), 'forgotten_password')) {
    let usName = 0;
    const raw = ci.input.post('user_name');
    if (eq(raw, '')) {
      ci.fv.setRules('user_name', ci.lang('user_name'), 'required|valid_email');
    } else if (atAfterStart(raw)) {
      ci.fv.setRules('user_name', ci.lang('email'), 'trim|required|valid_email');
      usName = 1;
    } else {
      ci.fv.setRules('user_name', ci.lang('mobile_number'), 'trim|required|min_length[8]|max_length[8]|callback_valid_mobile[mobile_number]');
      usName = 2;
    }
    if (await ci.fv.run()) {
      const row = await userModel.findPasswordAccount(ci.db, 'wl_customers', userName);
      if (row) {
        await sendPasswordMail(ci, row, adminInfo, ci.config('site_name'));
        if (usName === 1 || usName === 2) data.message = stripNbsp(ci.config('forgot_password_success'));
        if (usName === 2) data.message = stripNbsp(ci.config('forgot_password_success'));
        data.success = 'true';
      } else {
        data.success = 'false';
        if (usName === 1) data.error = ci.lang('incorrect_email_sorry_we_can_not_find_an_account');
        else if (usName === 2) data.error = ci.lang('incorrect_number_sorry_we_can_not_find_an_account');
        else data.error = ci.config('email_not_exist');
      }
    } else {
      data = { success: 'false', error: firstValidationError(ci) };
    }
  } else {
    data.success = 'false';
    data.error = 'Parameter Missing';
  }
  ci.out.json(data);
}

/** valid_mobile($field) requested by URL: PHP 5.6 warns and runs it with null (no output). */
async function validMobile(req, res) {
  const { ci } = req;
  missingArgument(ci, 'User::valid_mobile', 477);
  validMobileCallback(ci, null);
}

/** /api/user/checkreferral — a form-validation callback; outputs nothing. */
async function checkreferral(req, res) {
  const { ci } = req;
  const referralCode = ci.input.post('referral_code');
  const count = await userModel.countReferral(ci.db, referralCode, ci.input.post('email'));
  if (toBool(referralCode) && count === 0) ci.fv.setMessage('checkreferral', 'Referral code does not exist');
}

/** Registration mails (wl_auto_respond_mails 1 to the user, 6 to the admin). */
async function sendRegisterMails(ci) {
  const { getContent } = require('../model/helper.model');
  const admin = await ci.adminInfo();
  const adminEmail = admin ? admin.admin_email : null;
  const siteName = ci.config('site_name');
  const firstName = ci.input.post('first_name', true);
  const lastName = ci.input.post('last_name', true);
  const username = ci.input.post('email', true);
  const password = ci.input.post('password', true);
  const verifyUrl = `<a href=${siteUrl(ci, 'users/login')}>Click here </a>`;
  const name = `${ucwords(firstName)} ${ucwords(lastName)}`;

  let content = await getContent(ci.db, 'wl_auto_respond_mails', '1');
  let subject = replace(content ? content.email_subject : null, '{site_name}', siteName);
  let body = content ? content.email_content : null;
  body = replace(body, '{mem_name}', name);
  body = replace(body, '{username}', username);
  body = replace(body, '{password}', password);
  body = replace(body, '{admin_email}', adminEmail);
  body = replace(body, '{site_name}', siteName);
  body = replace(body, '{url}', ci.baseUrl());
  body = replace(body, '{link}', verifyUrl);
  mailNotify({ subject, to_email: ci.input.post('user_name'), from_email: adminEmail, from_name: siteName, body_part: body });

  content = await getContent(ci.db, 'wl_auto_respond_mails', '6');
  subject = replace(content ? content.email_subject : null, '{site_name}', siteName);
  body = content ? content.email_content : null;
  body = replace(body, '{name}', name);
  body = replace(body, '{username}', username);
  body = replace(body, '{password}', password);
  body = replace(body, '{admin_email}', adminEmail);
  body = replace(body, '{site_name}', siteName);
  body = replace(body, '{url}', ci.baseUrl());
  mailNotify({ subject, to_email: adminEmail, from_email: ci.input.post('user_name'), from_name: siteName, body_part: body });
  return { username, password };
}

/** POST /api/user/register */
async function register(req, res) {
  const { ci } = req;
  await userModel.adminRow(ci); // $adminInfo (unused)
  let data = {};
  if (neq(ci.input.post('action'), '')) {
    ci.fv.setRules('email', 'Email ID', 'trim|required|valid_email|max_length[80]|callback_email_check');
    ci.fv.setRules('password', 'Password', 'trim|required|max_length[20]|valid_password');
    ci.fv.setRules('confirm_password', 'Confirm password', 'required|max_length[20]|matches[password]');
    ci.fv.setRules('first_name', 'Name', 'trim|required|alpha|max_length[32]');
    ci.fv.setRules('last_name', 'Last Name', 'trim|alpha|max_length[32]');
    ci.fv.setRules('mobile_number', 'Mobile', 'trim|required|numeric|min_length[10]|max_length[10]|callback_mobile_check');
    ci.fv.setRules('terms_conditions', 'Terms & Conditions', 'trim|required');
    ci.fv.setRules('customer_type', 'Customer Type', 'required|max_length[11]');
    ci.fv.setRules('app_id', 'App Id', 'required|max_length[200]');
    ci.fv.setRules('device_id', 'Device Id', 'required|max_length[200]');
    ci.fv.setRules('app_type', 'App Type', 'required|max_length[20]');

    if (await ci.fv.run()) {
      const password = safeEncrypt.encode(ci.input.post('password'));
      const email = ci.input.post('email');
      const customerType = ci.input.post('customer_type');
      const status = eq(customerType, '1') ? '0' : '1';
      const now = ci.config('config.date.time');
      let posted = {
        actkey: md5(email),
        user_name: email,
        password,
        first_name: ci.input.post('first_name'),
        last_name: ci.input.post('last_name'),
        mobile_number: ci.input.post('mobile_number'),
        customer_type: customerType,
        status,
        is_verified: '1',
        is_verified_mobile: '1',
        device_id: ci.input.post('device_id'),
        app_type: ci.input.post('app_type'),
        app_id: ci.input.post('app_id'),
        ip_address: ci.input.ipAddress(),
        current_login: now,
        account_created_date: now,
      };
      posted = xssClean(posted, ci.requestUri);

      let customersId = intval(await userModel.fieldValue(ci.db, 'wl_customers', 'customers_id', { user_name: email, 'status!': '2' }));
      let registerId;
      if (customersId > 0) {
        registerId = customersId;
        await userModel.safeUpdate(ci.db, 'wl_customers', posted, { customers_id: customersId });
      } else {
        registerId = await userModel.safeInsert(ci.db, 'wl_customers', posted);
        customersId = registerId;
      }

      let username = null;
      let plain = null;
      if (neq(registerId, '')) {
        ({ username, password: plain } = await sendRegisterMails(ci));
      }

      if (status === '0') {
        data.error = 'Your account needs to be verified by admin.';
        data.success = 'false';
      } else {
        const userData = await userModel.verifyUser(ci, username, plain);
        const token = await issueToken(ci, registerId, { loginType: '0', provider: 'user' });
        const cur = await currency(ci);
        data.currency_code = cur.code;
        data.currency_symbol = cur.symbolLeft;
        data.token = token;
        data.user_id = registerId;
        data.login_type = '0';
        data.customer_type = customerType;
        data.success = 'true';
        data.first_name = userData ? userData.first_name : null;
        data.last_name = userData ? userData.last_name : null;
        data.mobile_number = userData ? userData.mobile_number : null;
        data.user_email = userData ? userData.username : null;
        data.success = 'true';
        data.message = replace(ci.config('register_thanks'), '<site_name>', ci.config('site_name'));
      }
    } else {
      data = { success: 'false', error: firstValidationError(ci) };
    }
  } else {
    data.success = 'false';
    data.error = 'Parameter Missing';
  }
  ci.out.json(data);
}

/** POST /api/user/otp — loads export/export_model first, which does not exist in the PHP project. */
async function otp(req, res) {
  req.ci.out.showError('Unable to locate the model you have specified: Export_model');
}

/** /api/user/check_verify_code — a form-validation callback; outputs nothing. */
async function checkVerifyCode(req, res) {
  const { ci } = req;
  const registerId = intval(ci.input.getPost('user_id'));
  const verifyCode = await userModel.customerVerifyCode(ci.db, registerId);
  if (eq(verifyCode, ci.input.post('verify_code'))) return;
  ci.fv.setMessage('check_verify_code', ci.lang('invalid_verification_code'));
}

/** OTP text used by resend/guest_login. */
function otpMessage(ci, verifyCode, appType, companyName, withColon) {
  if (appType === 'android') {
    return `${str(ci.lang('use'))} code : ${verifyCode} M3B6A7wEeNS ${str(ci.lang('as_your_login_otp_otp_is_confidential'))} ${str(ci.lang('from'))} ${str(companyName)}`;
  }
  return `${str(ci.lang('use'))} code${withColon ? ' :' : ''} ${verifyCode} ${str(ci.lang('as_your_login_otp_otp_is_confidential'))} ${str(ci.lang('from'))} ${str(companyName)}`;
}

/** Guest OTP mail sent when the "mobile number" is an e-mail address. */
function mailOtp(ci, admin, subject, smsMsg) {
  const companyName = admin ? admin.company_name : null;
  const adminEmail = admin ? admin.admin_email : null;
  let body = replace(smsMsg, '{admin_email}', adminEmail);
  body = replace(body, '{site_name}', companyName);
  mailNotify({ subject, to_email: ci.input.post('mobile_number'), from_email: adminEmail, from_name: companyName, body_part: body });
}

/** POST /api/user/resend — action=resend, mobile_number (8-digit mobile or e-mail) */
async function resend(req, res) {
  const { ci } = req;
  let data = {};
  if (eq(ci.input.post('action'), 'resend')) {
    let usName = 0;
    const raw = ci.input.post('mobile_number');
    if (eq(raw, '')) {
      ci.fv.setRules('mobile_number', ci.lang('username'), 'required');
    } else if (atAfterStart(raw)) {
      ci.fv.setRules('mobile_number', ci.lang('email'), 'trim|required|valid_email');
      usName = 1;
    } else {
      ci.fv.setRules('mobile_number', ci.lang('mobile_number'), 'trim|required|min_length[8]|max_length[8]|callback_valid_mobile[mobile_number]');
      usName = 2;
    }
    if (await ci.fv.run()) {
      const field = usName > 1 ? 'mobile_number' : 'user_name';
      const mres = await userModel.singleRow(
        ci,
        'wl_customers',
        'customers_id,user_name,first_name,last_name,mobile_number,is_verified_mobile,is_verified,app_type',
        { [field]: ci.input.post('mobile_number') },
      );
      const mobileNumber = mres ? (usName > 1 ? mres.mobile_number : mres.user_name) : null;
      const appType = mres ? mres.app_type : null;
      if (mres) {
        if (eq(mres.is_verified_mobile, '1') && usName > 1) {
          data.success = 'false';
          data.message = ci.lang('already_mobile_verified');
        } else if (eq(mres.is_verified, '1')) {
          data.success = 'false';
          data.message = ci.lang('already_mobile_verified');
        } else {
          const verifyCode = randomString('numeric', 4);
          await userModel.safeUpdate(ci.db, 'wl_customers', { verify_code: verifyCode }, { customers_id: mres.customers_id });
          const admin = await ci.adminInfo();
          const companyName = admin ? admin.company_name : null;
          if (usName > 1) {
            if (neq(mobileNumber, '')) {
              ci.out.fatalError('Call to undefined function SMSSend()', FILE, 933);
            }
          } else {
            const smsMsg = otpMessage(ci, verifyCode, null, companyName, true);
            mailOtp(ci, admin, `Guest Verification Otp from${str(companyName)}`, smsMsg);
          }
          data.success = 'true';
          data.message = ci.lang('otp_code_sent');
          data.otp_code = verifyCode;
          data.mobile_number = mobileNumber;
          void appType;
        }
      } else {
        data.success = 'false';
        data.message = ci.lang('invalid_mobile_not_exist');
      }
    } else {
      data = { success: 'false', error: firstValidationError(ci) };
    }
  } else {
    data.success = 'false';
    data.error = 'Parameter missing.';
  }
  ci.out.json(data);
}

/** /api/user/logout — user_id, app_id (GET or POST); clears the (empty) session only. */
async function logout(req, res) {
  const { ci } = req;
  ci.input.getPost('app_id');
  const userId = ci.input.getPost('user_id');
  const data = {};
  if (toBool(userId)) {
    for (const k of ['user_id', 'login_type', 'logged_in', 'username', 'session_id', 'type', 'first_name', 'last_name', 'name', 'mkey', 'is_blocked', 'blocked_time']) {
      ci.session.delete(k);
    }
    data.success = 'true';
    data.message = 'User logout successfully !';
  } else {
    data.success = 'false';
    data.error = 'Parameter Missing !';
  }
  ci.out.json(data);
}

/** /api/user/email_check — a form-validation callback; outputs nothing. */
async function emailCheck(req, res) {
  await emailCheckCallback(req.ci);
}

/** /api/user/mobile_check — a form-validation callback; outputs nothing. */
async function mobileCheck(req, res) {
  await mobileCheckCallback(req.ci);
}

/** valid_captcha_code($verification_code) requested by URL: warning, then a fatal error. */
async function validCaptchaCode(req, res) {
  const { ci } = req;
  missingArgument(ci, 'User::valid_captcha_code', 1087);
  // $this->securimage_library is never loaded.
  ci.out.fatalError('Call to a member function check() on null', FILE, 1089);
}

/**
 * /api/user/verify — Users_model::activate_account($this->uri->segment(3)) (always "verify"), which ends
 * with redirect('users/login').
 */
async function verify(req, res) {
  const { ci } = req;
  const cid = ci.segment(3);
  const isVerified = await userModel.activateAccount(ci.db, cid);
  if (eq(isVerified, 0)) await userModel.markVerifiedByMd5(ci.db, cid);
  ci.session.set('msg_type', 'success');
  // redirect(): HTTP/1.1 → 303 for non-GET requests, 307 for GET.
  ci.out.status = ci.input.server('REQUEST_METHOD') !== 'GET' ? 303 : 307;
  ci.out.header('Location', siteUrl(ci, 'users/login'));
  ci.exit();
}

/** /api/user/country */
async function country(req, res) {
  const { ci } = req;
  // $this->language_id is not defined on the controller (NULL).
  const rows = await userModel.countries(ci.db, null);
  const data = { res: [] };
  if (rows) {
    data.success = 'true';
    data.res = rows;
  } else {
    data.success = 'false';
    data.error = ci.lang('no_record_found');
  }
  ci.out.json(data);
}

/** /api/user/state — country_id (GET or POST) */
async function state(req, res) {
  const { ci } = req;
  const countryId = ci.input.getPost('country_id');
  const rows = await userModel.states(ci.db, gtZero(countryId) ? interp(countryId) : undefined);
  const data = { res: [] };
  if (rows) {
    data.success = 'true';
    data.res = rows;
  } else {
    data.success = 'false';
    data.error = ci.lang('no_record_found');
  }
  ci.out.json(data);
}

/** /api/user/city — state_id (GET or POST) */
async function city(req, res) {
  const { ci } = req;
  const stateId = ci.input.getPost('state_id');
  const rows = await userModel.cities(ci.db, gtZero(stateId) ? interp(stateId) : undefined);
  const data = { res: [] };
  if (rows) {
    data.success = 'true';
    data.res = rows;
  } else {
    data.success = 'false';
    data.error = ci.lang('no_record_found');
  }
  ci.out.json(data);
}

/** POST /api/user/guest_login — action=guest_login, mobile_number (8 digits), device_id, app_id, app_type */
async function guestLogin(req, res) {
  const { ci } = req;
  let data = {};
  if (eq(ci.input.post('action'), 'guest_login')) {
    const usName = 2;
    ci.fv.setRules('mobile_number', ci.lang('mobile_number'), 'trim|required|min_length[8]|max_length[8]|callback_valid_mobile[mobile_number]');
    ci.fv.setRules('device_id', ci.lang('device_id'), 'required');
    ci.fv.setRules('app_id', ci.lang('app_id'), 'required');
    ci.fv.setRules('app_type', ci.lang('app_type'), 'required');

    if (await ci.fv.run()) {
      const field = 'mobile_number';
      const mobileNumber = ci.input.post('mobile_number');
      const userCount = await userModel.countCustomers(ci.db, field, mobileNumber);
      const verifyCode = randomString('numeric', 4);
      const admin = await ci.adminInfo();
      const companyName = admin ? admin.company_name : null;
      let registerId;
      if (userCount === 0) {
        const p = randomString('alnum', 8);
        let posted = {
          actkey: '',
          password: safeEncrypt.encode(p),
          first_name: 'Guest',
          last_name: 'Member',
          status: '1',
          is_verified: '0',
          is_verified_mobile: '0',
          app_type: ci.input.post('app_type'),
          app_id: ci.input.post('app_id'),
          device_id: ci.input.post('device_id'),
          ip_address: ci.input.ipAddress(),
          verify_code: verifyCode,
          referral_code: randomString('alnum', 8),
          account_created_date: ci.config('config.date.time'),
        };
        posted.mobile_number = ci.input.post('mobile_number', true);
        posted = xssClean(posted, ci.requestUri);
        registerId = await userModel.safeInsert(ci.db, 'wl_customers', posted);
        if (neq(registerId, '')) {
          await userModel.safeInsert(ci.db, 'wl_customers_address_book', {
            customer_id: registerId,
            first_name: '',
            name: '',
            mobile: ci.input.getPost('mobile_number', true),
            reciv_date: ci.config('config.date.time'),
            address_type: 'Ship',
            default_status: 'Y',
          });
          if (neq(ci.input.getPost('mobile_number', true), '')) {
            ci.out.fatalError('Call to undefined function SMSSend()', FILE, 1283);
          }
        }
      } else {
        registerId = await userModel.fieldValue(ci.db, 'wl_customers', 'customers_id', { [field]: mobileNumber });
        await userModel.safeUpdate(
          ci.db,
          'wl_customers',
          {
            app_type: ci.input.post('app_type'),
            app_id: ci.input.post('app_id'),
            device_id: ci.input.post('device_id'),
            verify_code: verifyCode,
            is_verified_mobile: '0',
            is_verified: '0',
          },
          { customers_id: registerId },
        );
      }
      if (usName > 1 && neq(ci.input.getPost('mobile_number', true), '')) {
        void companyName;
        ci.out.fatalError('Call to undefined function SMSSend()', FILE, 1364);
      }
      await userModel.assignTempData(ci.db, registerId, ci.input.post('app_id'));
      const cur = await currency(ci);
      data.currency_code = cur.code;
      data.currency_symbol = cur.symbolLeft;
      data.success = 'true';
      data.otp_code = verifyCode;
      data.message = 'Otp Verify';
      data.mobile_verification = 'true';
      data.mobile_number = mobileNumber;
      data.success = 'true';
    } else {
      data = { success: 'false', error: firstValidationError(ci) };
    }
  } else {
    data.success = 'false';
    data.error = 'Parameter Missing';
  }
  ci.out.json(data);
}

/** /api/user/guest_otp — action=guest_otp, mobile_number, verify_code, device_id, app_id, app_type */
async function guestOtp(req, res) {
  const { ci } = req;
  let data = {};
  if (eq(ci.input.post('action'), 'guest_otp')) {
    ci.fv.setRules('mobile_number', ci.lang('mobile_number'), 'trim|required|min_length[8]|max_length[8]|callback_valid_mobile[mobile_number]');
    ci.fv.setRules('verify_code', ci.lang('verify_code'), 'trim|required|max_length[5]');
    ci.fv.setRules('device_id', ci.lang('device_id'), 'required');
    ci.fv.setRules('app_id', ci.lang('app_id'), 'required');
    ci.fv.setRules('app_type', ci.lang('app_type'), 'required');

    if (await ci.fv.run()) {
      const mres = await userModel.singleRow(
        ci,
        'wl_customers',
        'customers_id,user_name,first_name,last_name,mobile_number,verify_code,is_verified_mobile',
        { mobile_number: ci.input.post('mobile_number') },
      );
      if (mres) {
        if (mres.verify_code !== ci.input.post('verify_code')) {
          data.success = 'false';
          data.message = ci.lang('invalid_otp_code');
        } else {
          const userId = mres.customers_id;
          await userModel.safeUpdate(ci.db, 'wl_customers', { is_verified_mobile: '1', is_verified: '1', verify_code: '' }, { customers_id: userId });
          const token = await issueToken(ci, userId, { loginType: '1', provider: 'user', insertLoginType: '1' });
          const cur = await currency(ci);
          data.currency_code = cur.code;
          data.currency_symbol = cur.symbolLeft;
          data.success = 'true';
          data.message = ci.lang('your_account_has_been_verified');
          data.token = token;
          data.user_id = userId;
          data.login_type = '1';
          data.first_name = mres.first_name;
          data.last_name = mres.last_name;
          data.mobile_number = mres.mobile_number;
          data.user_email = mres.user_name;
          data.mobile_verification = 'false';
        }
      } else {
        data.success = 'false';
        data.message = ci.lang('invalid_mobile_not_exist');
      }
    } else {
      data = { success: 'false', error: firstValidationError(ci) };
    }
  } else {
    data.success = 'false';
    data.error = 'Parameter missing.';
  }
  ci.out.json(data);
}

/** /api/user/transporter_login — user_name, password, device_id, app_id, app_type */
async function transporterLogin(req, res) {
  const { ci } = req;
  ci.fv.setRules('user_name', ci.lang('username'), 'required');
  ci.fv.setRules('password', ci.lang('password'), 'required');
  ci.fv.setRules('device_id', ci.lang('device_id'), 'required');
  ci.fv.setRules('app_id', ci.lang('app_id'), 'required');
  ci.fv.setRules('app_type', ci.lang('app_type'), 'required');

  let data = {};
  if (await ci.fv.run()) {
    const username = ci.input.post('user_name');
    const password = safeEncrypt.encode(ci.input.post('password'));
    const rows = await userModel.findTransporter(ci.db, username, password);
    if (rows.length > 0) {
      const userData = rows[0];
      const userId = userData.transporter_id;
      if (userData.status === '0') {
        data.error = ci.lang('login_failed_your_account_has_been_deactivated_please_contact_to_admin');
        data.success = 'false';
      } else {
        const udata = xssClean(
          {
            last_login_date: userData.current_login,
            current_login: ci.config('config.date.time'),
            app_id: ci.input.post('app_id'),
            app_type: ci.input.post('app_type'),
            device_id: ci.input.post('device_id'),
          },
          ci.requestUri,
        );
        await userModel.safeUpdate(ci.db, 'wl_transporters', udata, { transporter_id: userId });
        const token = await issueToken(ci, userId, { provider: 'transporter' });
        data.token = token;
        data.success = 'true';
        data.message = ci.lang('login_successful');
        data.name = userData.first_name;
        data.mobile_number = userData.mobile_number;
        data.is_online = userData.is_online;
        data.user_email = userData.user_name;
        data.transporter_id = userData.transporter_id;
        data.user_id = userId;
      }
    } else {
      data.success = 'false';
      data.error = ci.lang('login_failed');
    }
  } else {
    data = { success: 'false', error: firstValidationError(ci) };
  }
  ci.out.json(data);
}

/** /api/user/transporter_forgotten_password — action=forgotten_password, user_name */
async function transporterForgottenPassword(req, res) {
  const { ci } = req;
  const adminInfo = await userModel.adminRow(ci);
  const userName = ci.input.post('user_name', true);
  ci.fv.setRules('user_name', ci.lang('user_name'), 'required');
  let data = {};
  if (eq(ci.input.post('action'), 'forgotten_password')) {
    if (await ci.fv.run()) {
      const row = await userModel.findPasswordAccount(ci.db, 'wl_transporters', userName);
      if (row) {
        const admin = await ci.adminInfo();
        await sendPasswordMail(ci, row, adminInfo, admin ? admin.company_name : null);
        data.success = 'true';
        data.message = stripNbsp(ci.lang('forgot_password_success'));
      } else {
        data.success = 'false';
        data.error = ci.lang('email_not_exist');
      }
    } else {
      data = { success: 'false', error: stripNbsp(ci.fv.errorString('&nbsp;', '&nbsp;')) };
    }
  } else {
    data.success = 'false';
    data.error = 'Parameter Missing';
  }
  ci.out.json(data);
}

/** /api/user/test_sendsms — calls the undefined SMSSend(). */
async function testSendsms(req, res) {
  const { ci } = req;
  randomString('numeric', 4);
  await ci.adminInfo();
  ci.out.fatalError('Call to undefined function SMSSend()', FILE, 1763);
}

module.exports = {
  construct,
  index,
  faceAuthotication,
  login,
  forgottenPassword,
  validMobile,
  checkreferral,
  register,
  otp,
  checkVerifyCode,
  resend,
  logout,
  emailCheck,
  mobileCheck,
  validCaptchaCode,
  verify,
  country,
  state,
  city,
  guestLogin,
  guestOtp,
  transporterLogin,
  transporterForgottenPassword,
  testSendsms,
};
