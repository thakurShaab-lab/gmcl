/**
 * modules/api/controllers/Member.php (class Member extends Api_Controller).
 * The constructor (error delimiters "" / "", logged-in user required) is reproduced by the router
 * (apiAuth + requireUser) and setup() below.
 */
const fs = require('fs');
const path = require('path');
const { sql } = require('drizzle-orm');
const env = require('../config/env');
const m = require('../model/member.model');
const { getDbSingleRow, getFoundRows } = require('../model/common.model');
const { getContent } = require('../model/helper.model');
const { getDateFormat } = require('../utils/helpers');
const { encode } = require('../utils/safeEncrypt');
const { xssClean } = require('../utils/xssClean');
const { myUpload } = require('../utils/upload');
const { mailNotify } = require('../utils/mailer');
const { str, intval, num, isNumeric, empty, eq, toBool, trim, ucwords, numberFormat, phpDate, strtotime, time, round } = require('../utils/php');

const FILE = 'modules/api/controllers/Member.php';
const SHORT_FILE = 'controllers/Member.php';

/* ------------------------------------------------------------------ shared bits */

/** Constructor: $this->form_validation->set_error_delimiters("",""); callback methods of the controller. */
function setup(ci) {
  ci.fv.setErrorDelimiters('', '');
  ci.callbacks.valid_mobile = async (field) => validMobile(ci, field);
  ci.callbacks.valid_area = async (field) => validArea(ci, field);
  ci.callbacks.mobile_check = async () => mobileCheck(ci);
  ci.callbacks.email_check = async () => emailCheck(ci);
  ci.callbacks.oldpwd_check = async () => oldpwdCheck(ci);
  ci.callbacks.smepwd_check = async () => smepwdCheck(ci);
  ci.callbacks.check_price_zero = async () => checkPriceZero(ci);
}

const userImagePath = (ci) => `${ci.baseUrl()}uploaded_files/customers`;
const noImagePath = (ci) => `${ci.baseUrl()}uploaded_files/products/noimg.png`;
const productImagePath = (ci) => `${ci.baseUrl()}uploaded_files/products`;
const now = (ci) => ci.config('config.date.time');

/** @str_replace(array("&nbsp;", "\n"), "", @array_values(web_service_validation_errors_list())[0]) */
const firstValidationError = (ci) => stripNbsp(ci.fv.firstError());
const stripNbsp = (s) => str(s).split('&nbsp;').join('').split('\n').join('');

/** $this->security->xss_clean($array) */
function clean(ci, data) {
  // xss_clean() of NULL yields "" (shared xssClean() throws on null values nested in an object)
  const out = {};
  for (const [k, v] of Object.entries(data)) out[k] = xssClean(v === null || v === undefined ? '' : v, ci.requestUri);
  return out;
}

/** $this->input->post('action') == "<name>" */
const actionIs = (ci, name) => ci.input.post('action') === name;

/** where "customers_id ='<user>'" */
const customerWhere = (ci) => sql`\`customers_id\` = ${str(ci.userId)}`;

/** get_db_single_row('wl_customers', 'customers_id as user_id,...', array("customers_id"=>$userId)) */
function customerRow(ci, extra = '') {
  return getDbSingleRow(
    ci.db,
    'wl_customers',
    `customers_id as user_id,user_name,first_name,last_name,CONCAT(first_name," ",last_name) as name,customer_photo,mobile_number${extra}`,
    { customers_id: ci.userId },
    ci.out,
  );
}

/** $this->members_model->get_members(1, 0, array('status'=>'1','customer_id'=>$this->userId)) */
const memberRes = (ci) => m.getMembers(ci, 1, 0, { status: '1', customer_id: ci.userId });

/** PHP string ">" for two request strings (numeric strings compare as numbers). */
function phpGreater(a, b) {
  if (isNumeric(a) && isNumeric(b)) return Number(a) > Number(b);
  return Buffer.compare(Buffer.from(a), Buffer.from(b)) > 0;
}

/** The default product image loop body shared by orders()/invoice()/print_invoice(). */
async function attachMedia(ci, val, { brokenTable = false, setProductImage = true } = {}) {
  const rows = await m.productDefaultMedia(ci.db, val.products_id, brokenTable);
  if (rows.length > 0) {
    const res = rows[0];
    val.product_image = '';
    if (str(res.media) !== '' && m.productImageExists(res.media)) {
      val.media = res.media;
      if (setProductImage) val.product_image = res.media;
    } else {
      val.media = '';
    }
  } else {
    val.product_image = '';
    val.media = '';
  }
}

/* ------------------------------------------------------------------ callbacks / public helpers */

/** valid_mobile($field) */
function validMobile(ci, field) {
  if (str(field) !== '') {
    ci.fv.setMessage('valid_mobile', `%s ${str(ci.lang('may_only_contain_number'))}`);
    return /^([0-9,\-+])+$/i.test(str(field));
  }
  return null;
}

/** valid_area($field) */
function validArea(ci, field) {
  if (eq(field, 0)) {
    ci.fv.setMessage('valid_area', `%s ${str(ci.fv.line('required'))}`);
    return false;
  }
  return true;
}

/** email_check() */
async function emailCheck(ci) {
  const email = ci.input.post('email');
  if (str(email) !== '') {
    if (await m.isEmailExists(ci.db, 'user_name', email, ci.userId)) {
      ci.fv.setMessage('email_check', ci.lang('exists_user_id'));
      return false;
    }
    return true;
  }
  return null;
}

/** mobile_check() */
async function mobileCheck(ci) {
  const mobile = ci.input.post('mobile_number');
  if (str(mobile) !== '') {
    if (await m.isEmailExists(ci.db, 'mobile_number', mobile, ci.userId)) {
      ci.fv.setMessage('mobile_check', ci.lang('mobile_number_already_exist'));
      return false;
    }
    return true;
  }
  return null;
}

/** smepwd_check() */
function smepwdCheck(ci) {
  if (eq(ci.input.post('old_password'), ci.input.post('new_password'))) {
    ci.fv.setMessage('smepwd_check', ci.lang('old_password_and_new_password_password_should_not_be_same'));
    return false;
  }
  return true;
}

/** oldpwd_check() */
async function oldpwdCheck(ci) {
  const passwordOld = encode(ci.input.getPost('old_password'));
  const row = await m.getMemberRow(ci.db, ci.userId, sql` AND password=${str(passwordOld)}`);
  if (!row) {
    ci.fv.setMessage('oldpwd_check', ci.config('myaccount_password_not_match'));
    return false;
  }
  return true;
}

/** check_price_zero() */
function checkPriceZero(ci) {
  const price = ci.input.post('prices');
  if (!empty(price) && num(price) <= 0 && !Array.isArray(price)) {
    ci.fv.setMessage('check_price_zero', ci.lang('price_must_be_a_postive_numeric_number'));
    return false;
  }
  return true;
}

/**
 * PHP 5.6 "Missing argument 1 for X()" warning for a method called by URL (the method then runs with NULL).
 * Used for the inherited MY_Controller methods, whose frame points at apps/core/MY_Controller.php
 * (ci.out.missingArguments() assumes a file under modules/api/).
 */
function missingArgument(ci, fn, shortFile, file, line) {
  ci.out.phpWarning(`Missing argument 1 for ${fn}()`, shortFile, line, {
    frames: [null, null, { file, line, fn: '_error_handler' }, null, null, { file: 'index.php', line: 304, fn: 'require_once' }],
  });
}

/** "Invalid argument supplied for foreach()" raised in a Member method (same frame layout as above). */
function foreachWarning(ci, line) {
  ci.out.phpWarning('Invalid argument supplied for foreach()', SHORT_FILE, line, {
    frames: [null, null, { file: FILE, line, fn: '_error_handler' }, null, null, { file: 'index.php', line: 304, fn: 'require_once' }],
  });
}

/** Public callback methods called by URL: they only return a value, so the response is empty. */
const routeEmailCheck = async (req) => {
  setup(req.ci);
  await emailCheck(req.ci);
};
const routeMobileCheck = async (req) => {
  setup(req.ci);
  await mobileCheck(req.ci);
};
const routeSmepwdCheck = async (req) => {
  setup(req.ci);
  smepwdCheck(req.ci);
};
const routeOldpwdCheck = async (req) => {
  setup(req.ci);
  await oldpwdCheck(req.ci);
};
const routeCheckPriceZero = async (req) => {
  setup(req.ci);
  checkPriceZero(req.ci);
};
const routeValidMobile = async (req) => {
  setup(req.ci);
  req.ci.out.missingArguments('Member::valid_mobile', 1, SHORT_FILE, 608);
  validMobile(req.ci, null);
};
const routeValidArea = async (req) => {
  setup(req.ci);
  req.ci.out.missingArguments('Member::valid_area', 1, SHORT_FILE, 618);
  validArea(req.ci, null);
};


/* ------------------------------------------------------------------ account */

/** member_topheader */
async function memberTopheader(req) {
  const { ci } = req;
  setup(ci);
  ci.out.json({ mres: ci.user, user_image: userImagePath(ci) });
}

/** index */
async function index(req) {
  const { ci } = req;
  setup(ci);
  const data = {};
  data.success = 'true';
  data.user = ci.user;
  data.mres = await memberRes(ci);
  data.user_image_path = userImagePath(ci);
  data.product_no_image_path = noImagePath(ci);
  ci.out.json(data);
}

/** edit_account — first_name, last_name, mobile_number, action=edit_account */
async function editAccount(req) {
  const { ci } = req;
  setup(ci);
  ci.fv.setRules('first_name', 'First Name', 'trim|required|max_length[80]|alpha');
  ci.fv.setRules('last_name', 'Last Name', 'trim|max_length[30]|alpha');
  ci.fv.setRules('mobile_number', 'Mobile', 'trim|required|numeric|min_length[10]|max_length[10]|callback_valid_mobile[mobile_number]|callback_mobile_check');
  const data = {};
  if (actionIs(ci, 'edit_account')) {
    if (await ci.fv.run()) {
      const posted = clean(ci, {
        first_name: ci.input.post('first_name', true),
        last_name: ci.input.post('last_name', true),
        mobile_number: ci.input.post('mobile_number', true),
        is_verified_mobile: '1',
      });
      await m.updateRows(ci.db, 'wl_customers', posted, customerWhere(ci));
      data.success = 'true';
      data.message = ci.config('myaccount_update');
      data.user = await customerRow(ci);
      data.mres = await memberRes(ci);
      data.user_image_path = userImagePath(ci);
      data.is_logout = '0';
    } else {
      data.success = 'false';
      data.error = firstValidationError(ci);
    }
  } else {
    data.success = 'false';
    data.error = 'parameter missing';
  }
  ci.out.json(data);
}

/** pathinfo($name, PATHINFO_EXTENSION) */
function pathinfoExtension(name) {
  const base = str(name).split(/[\\/]/).pop();
  const i = base.lastIndexOf('.');
  return i === -1 ? '' : base.slice(i + 1);
}

/** update_image — multipart customer_photo, action=image_upload */
async function updateImage(req) {
  const { ci } = req;
  setup(ci);
  const imgAllowSize = ci.config('allow.file.size');
  const data = {};
  if (actionIs(ci, 'image_upload')) {
    const photo = ci.FILES.customer_photo;
    const hasPhoto = () => !empty(ci.FILES) && photo && typeof photo.name === 'string' && photo.name !== '';
    if (hasPhoto() && pathinfoExtension(photo.name) === '') photo.name = `${photo.name}.jpg`;
    ci.fv.setRules('customer_photo', 'Image', `required|file_allowed_type[image]|file_size_max[${str(imgAllowSize)}]`);
    if (await ci.fv.run()) {
      let userImage = ci.user.customer_photo;
      const unlinkImage = { source_dir: 'customers', source_file: ci.user.customer_photo };
      if (hasPhoto()) {
        const uploaded = myUpload(ci.FILES, 'customer_photo', 'customers');
        if (uploaded && !empty(uploaded)) {
          userImage = uploaded.upload_data.file_name;
          removeImage(unlinkImage);
        }
      }
      await m.updateRows(ci.db, 'wl_customers', clean(ci, { customer_photo: userImage }), customerWhere(ci));
      data.success = 'true';
      data.message = ci.lang('myaccount_update');
      data.user = await customerRow(ci);
      data.user_image_path = userImagePath(ci);
      data.product_no_image_path = noImagePath(ci);
    } else {
      data.success = 'false';
      data.error = firstValidationError(ci);
    }
  } else {
    data.success = 'false';
    data.error = 'parameter missing';
  }
  ci.out.json(data);
}

/** utils_helper removeImage($cfgs) */
function removeImage(cfg) {
  if (str(cfg.source_dir) !== '' && str(cfg.source_file) !== '') {
    const file = path.join(env.uploadDir, cfg.source_dir, str(cfg.source_file));
    try {
      if (fs.existsSync(file)) fs.unlinkSync(file);
    } catch (e) {
      /* PHP's unlink() warning would be the only effect */
    }
  }
}

/** face_authotication — is_face_authentication, action=face_authotication */
async function faceAuthotication(req) {
  const { ci } = req;
  setup(ci);
  ci.fv.setRules('is_face_authentication', ci.lang('face_authotication'), 'trim|required|min_length[1]');
  const data = {};
  if (actionIs(ci, 'face_authotication')) {
    if (await ci.fv.run()) {
      const posted = clean(ci, { is_face_authentication: eq(ci.input.post('is_face_authentication'), 1) ? '1' : '0' });
      await m.updateRows(ci.db, 'wl_customers', posted, customerWhere(ci));
      data.success = 'true';
      data.message = ci.lang('myaccount_update');
      data.user = await customerRow(ci, ',is_verified_mobile,referral_code,is_face_authentication');
      data.user_image_path = userImagePath(ci);
    } else {
      data.success = 'false';
      data.error = firstValidationError(ci);
    }
  } else {
    data.success = 'false';
    data.error = 'parameter missing';
  }
  ci.out.json(data);
}

/** change_password — old_password, new_password, confirm_password, action=change_password */
async function changePassword(req) {
  const { ci } = req;
  setup(ci);
  const data = {};
  if (actionIs(ci, 'change_password')) {
    ci.fv.setRules('old_password', 'Old Password', 'trim|required|callback_oldpwd_check[old_password]');
    ci.fv.setRules('new_password', 'New Password', 'trim|required|differs[old_password]|valid_password');
    ci.fv.setRules('confirm_password', 'Confirm Password', 'trim|required|matches[new_password]');
    if (await ci.fv.run()) {
      const passwordOld = encode(ci.input.getPost('old_password'));
      await m.getMemberRow(ci.db, ci.userId, sql` AND password=${str(passwordOld)} AND status='1'`);
      const password = encode(ci.input.post('new_password', true));
      await m.updateRows(ci.db, 'wl_customers', { password }, sql`\`customers_id\` = ${intval(ci.userId)} `);
      data.success = 'true';
      data.message = ci.config('myaccount_password_changed');
    } else {
      data.success = 'false';
      data.error = firstValidationError(ci);
    }
  } else {
    data.success = 'false';
    data.error = 'parameter missing';
  }
  ci.out.json(data);
}

/** delete_own_accounts */
async function deleteOwnAccounts(req) {
  const { ci } = req;
  setup(ci);
  const data = {};
  if ((await m.countCustomer(ci.db, ci.userId)) > 0) {
    await ci.db.execute(sql`UPDATE wl_customers SET status='2' where customers_id=${str(ci.userId)}`);
    data.success = 'true';
    data.message = 'Account has been deleted successfully.';
  } else {
    data.success = 'false';
    data.error = 'parameter missing';
  }
  ci.out.json(data);
}

/** members_listing */
async function membersListing(req) {
  const { ci } = req;
  setup(ci);
  const data = {};
  data.success = 'true';
  const rows = await m.getMembers(ci, '', 0, { where: " customer_type='0' AND status='1' " });
  const total = await getFoundRows(ci.db);
  if (rows.length) {
    data.success = 'true';
    data.total_records = total;
    data.res = rows.map((v) => {
      v.member_status = eq(v.status, 0) ? 'Inactive' : 'Active';
      return v;
    });
  } else {
    data.success = 'false';
    data.total_records = total;
    data.res = [];
    data.error = 'No Records Found !';
  }
  data.user_image_path = userImagePath(ci);
  data.user_no_image_path = noImagePath(ci);
  data.product_no_image_path = noImagePath(ci);
  ci.out.json(data);
}

/** admin_details — tbl_admin joined with tbl_admin_lang ($this->language_id is undefined -> '') */
async function adminDetails(req) {
  const { ci } = req;
  setup(ci);
  const data = {};
  const adminRes = await getDbSingleRow(ci.db, 'tbl_admin as ta, tbl_admin_lang as tal', '*', sql` and ta.admin_id =1 and tal.language_id=${''} `, ci.out);
  if (adminRes) {
    data.success = 'true';
    data.admin_res = adminRes;
  } else {
    data.success = 'false';
    data.error = 'parameter missing';
  }
  ci.out.json(data);
}

/** device_registration — device_id, app_id, action ($this->app_id is undefined -> NULL) */
async function deviceRegistration(req) {
  const { ci } = req;
  setup(ci);
  const appId = null;
  let data = {};
  if (toBool(ci.input.post('action'))) {
    ci.fv.setRules('device_id', ci.lang('registration_id'), 'trim|required|max_length[250]');
    ci.fv.setRules('app_id', ci.lang('app_id'), 'required');
    if (await ci.fv.run()) {
      const deviceId = ci.input.post('device_id');
      const deviceData = await m.dbFieldValue(ci.db, 'wl_device_registration', 'device_id', { device_id: deviceId, app_id: appId });
      const posted = { device_id: ci.input.post('device_id'), app_id: ci.input.post('app_id'), receive_date: now(ci) };
      const posted1 = { device_id: ci.input.post('device_id'), receive_date: now(ci) };
      if (str(deviceData) !== '') {
        await m.updateRows(ci.db, 'wl_device_registration', posted1, sql`\`app_id\` = ${str(appId)} `);
      } else {
        await m.insertRow(ci.db, 'wl_device_registration', posted);
      }
      data.success = 'true';
      data.message = ci.lang('thanks_for_the_details_we_will_contact_you_soon');
    } else {
      data = {};
      data.success = 'false';
      data.error = stripNbsp(ci.fv.errorString('&nbsp;', '&nbsp;'));
    }
  } else {
    data.success = 'false';
    data.error = 'parameter missing';
  }
  ci.out.json(data);
}

/* ------------------------------------------------------------------ addresses */

/** addresses */
async function addresses(req) {
  const { ci } = req;
  setup(ci);
  const { rows } = await m.getMemberAddressBook(ci.db, ci.userId, 'Ship');
  const data = {};
  if (rows) {
    data.res = rows;
  } else {
    data.success = 'false';
    data.error = ci.lang('no_record_found');
  }
  ci.out.json(data);
}

/** delete_address — address_id, action=delete_address */
async function deleteAddress(req) {
  const { ci } = req;
  setup(ci);
  const data = {};
  if (actionIs(ci, 'delete_address')) {
    let addressId = intval(ci.input.post('address_id'));
    if (addressId <= 0) {
      data.success = 'false';
      data.error = 'Address Id is not valid';
    } else {
      const guest = eq(ci.loginType, '1');
      if (guest) addressId = await m.dbFieldValue(ci.db, 'tbl_temp_delivery_address', 'id', { user_id: ci.userId, id: addressId });
      else addressId = await m.dbFieldValue(ci.db, 'wl_customers_address_book', 'address_id', { customer_id: ci.userId, address_id: addressId });
      // ($address_id >= 0) is always true for NULL or a positive id
      if (guest) await m.deleteRows(ci.db, 'tbl_temp_delivery_address', { id: addressId });
      else await m.deleteRows(ci.db, 'wl_customers_address_book', { address_id: addressId });
      data.success = 'true';
      data.message = ci.lang('shiping_address_delete');
    }
  } else {
    data.success = 'false';
    data.error = 'parameter missing';
  }
  ci.out.json(data);
}

/** __form_address_rules() */
function formAddressRules(ci) {
  const L = (k) => ci.lang(k);
  ci.fv.setRules('first_name', L('first_name'), 'trim|required|min_length[2]|max_length[50]');
  ci.fv.setRules('last_name', L('last_name'), 'trim|max_length[30]');
  ci.fv.setRules('mobile_number', L('mobile_number'), 'trim|required|max_length[15]|callback_valid_mobile[mobile_number]');
  ci.fv.setRules('address', L('address'), 'trim|required|max_length[250]');
  ci.fv.setRules('atype', L('atype'), 'trim|required|max_length[20]');
  ci.fv.setRules('street', L('street'), 'trim|required|max_length[20]');
  ci.fv.setRules('block', L('block'), 'trim|required|max_length[20]');
  ci.fv.setRules('house_no', L('house_no'), 'trim|max_length[50]');
  ci.fv.setRules('floor_no', L('floor_no'), 'trim|max_length[50]');
  ci.fv.setRules('building', L('building'), 'trim|max_length[50]');
  ci.fv.setRules('city', L('city'), 'trim|required|callback_valid_area[city]');
  ci.fv.setRules('area', L('area'), 'trim|required|callback_valid_area[area]');
  ci.fv.setRules('landmark', L('landmark'), 'trim|max_length[100]');
  ci.fv.setRules('longitude', L('longitude'), 'trim|required|max_length[20]');
  ci.fv.setRules('latitude', L('latitude'), 'trim|required|max_length[20]');
  return ci.fv.run();
}

/** add_address */
async function addAddress(req) {
  const { ci } = req;
  setup(ci);
  const data = {};
  if (actionIs(ci, 'add_address')) {
    if ((await formAddressRules(ci)) === true) {
      const p = (k, xss = true) => ci.input.post(k, xss);
      const shipping = { customer_id: ci.userId };
      const recCnt = await m.countDefaultAddresses(ci.db, ci.userId);
      const defaultStatus = recCnt > 0 ? 'N' : 'Y';
      shipping.reciv_date = now(ci);
      shipping.address_type = 'Ship';
      shipping.first_name = p('first_name');
      shipping.last_name = p('last_name');
      shipping.address = p('address');
      shipping.phone = p('phone');
      shipping.mobile = p('mobile_number');
      shipping.zipcode = p('zipcode');
      shipping.city = p('city');
      shipping.state = p('state');
      shipping.longitude = p('longitude');
      shipping.latitude = p('latitude');
      shipping.country = p('country', false);
      shipping.atype = p('atype');
      shipping.street = p('street');
      shipping.block = p('block', false);
      shipping.house_no = p('house_no');
      shipping.floor_no = p('floor_no');
      shipping.building = p('building', false);
      shipping.default_status = defaultStatus;
      await m.insertRow(ci.db, 'wl_customers_address_book', shipping);
      data.success = 'true';
      data.message = ci.lang('shiping_address_add');
    } else {
      data.success = 'false';
      data.error = firstValidationError(ci);
    }
  } else {
    data.success = 'false';
    data.error = 'parameter missing';
  }
  ci.out.json(data);
}

/** edit_address */
async function editAddress(req) {
  const { ci } = req;
  setup(ci);
  const userId = ci.userId;
  const data = {};
  let addressId = null;
  if (actionIs(ci, 'edit_address')) {
    addressId = intval(ci.input.post('address_id'));
    if (addressId <= 0) {
      data.success = 'false';
      data.error = 'Address Id is not valid';
    } else {
      addressId = await m.dbFieldValue(ci.db, 'wl_customers_address_book', 'address_id', { customer_id: userId, address_id: addressId });
      if ((await formAddressRules(ci)) === true) {
        const p = (k, xss = true) => ci.input.post(k, xss);
        const shipping = {
          first_name: p('first_name'),
          last_name: p('last_name'),
          name: `${str(p('first_name', false))} ${str(p('last_name', false))}`,
          address: p('address'),
          phone: p('mobile_number'),
          mobile: p('mobile_number'),
          city: p('city'),
          area: p('area'),
          country: p('country', false),
          zipcode: p('pin_code'),
        };
        shipping.longitude = p('longitude');
        shipping.latitude = p('latitude');
        shipping.atype = p('atype');
        shipping.street = p('street');
        shipping.block = p('block', false);
        shipping.house_no = p('house_no');
        shipping.floor_no = p('floor_no');
        shipping.building = p('building', false);
        await m.updateRows(
          ci.db,
          'wl_customers_address_book',
          shipping,
          sql`\`customer_id\` = ${str(userId)} AND \`address_id\` = ${str(addressId)} AND \`address_type\` = 'Ship'`,
        );
        data.success = 'true';
        data.message = ci.lang('shiping_address_update');
      } else {
        data.success = 'false';
        data.error = firstValidationError(ci);
      }
    }
  } else {
    data.success = 'false';
    data.error = 'parameter missing';
  }
  const addmres = await getDbSingleRow(
    ci.db,
    'wl_customers_address_book',
    '*',
    sql` AND customer_id=${str(userId)} AND address_type=${'Ship'} AND address_id=${str(addressId)}`,
    ci.out,
  );
  if (addmres) data.address_res = addmres;
  else data.error = 'no address added as yet.';
  ci.out.json(data);
}

/* ------------------------------------------------------------------ wishlist */

/** wishlist — limits, keyword (POST) */
async function wishlist(req) {
  const { ci } = req;
  setup(ci);
  let limits = intval(ci.input.getPost('limits'));
  limits = limits > 0 ? limits : 100000;
  const { rows } = await m.getWishlists(ci, 0, limits, ci.userId);
  const totalRows = await getFoundRows(ci.db);
  const data = {};
  if (Array.isArray(rows) && rows.length) {
    const res = [];
    for (const v of rows) {
      const media = await m.firstProductMedia(ci.db, v.products_id);
      v.media = str(media) !== '' && m.productImageExists(media) ? media : '';
      v.products_description = '';
      res.push(v);
    }
    data.success = 'true';
    data.totalorder = totalRows;
    data.res = res;
    data.product_image_path = productImagePath(ci);
    data.product_no_image_path = noImagePath(ci);
  } else {
    data.success = 'false';
    data.error = ci.lang('no_record_found');
  }
  ci.out.json(data);
}

/** delete_member_wishlist — id (GET or POST) */
async function deleteMemberWishlist(req) {
  const { ci } = req;
  setup(ci);
  const id = ci.input.getPost('id');
  const data = {};
  if (str(id) !== '' && num(ci.userId) > 0) {
    await m.deleteWishlist(ci.db, id, ci.userId);
    data.success = 'true';
    data.message = ci.config('wish_list_delete');
    await m.getWishlists(ci, 0, 2, ci.userId);
    data.wish_count = await getFoundRows(ci.db);
    data.wishlists_id = '';
  } else {
    data.success = 'false!';
    data.error = 'Parameter missing';
  }
  ci.out.json(data);
}

/* ------------------------------------------------------------------ orders */

/** reason_list — reason_type (POST) */
async function reasonList(req) {
  const { ci } = req;
  setup(ci);
  const reasonType = intval(ci.input.post('reason_type'));
  const data = {};
  if (reasonType > 0) {
    const rows = await m.getReasons(ci.db, reasonType);
    if (rows.length) {
      data.success = 'true';
      data.total_rows = rows.length;
      data.res = rows;
    } else {
      data.success = 'false';
      data.total_rows = 0;
      data.res = [];
      data.error = 'No Records Found !';
    }
  } else {
    data.success = 'false';
    data.error = 'Invalid reason type';
  }
  ci.out.json(data);
}

/** cancel_order — order_id, reason_id, comment, action=cancel_order */
async function cancelOrder(req) {
  const { ci } = req;
  setup(ci);
  const data = {};
  if (actionIs(ci, 'cancel_order')) {
    ci.fv.setRules('order_id', 'Order Id', 'trim|required|max_length[1000]');
    ci.fv.setRules('reason_id', 'Reason', 'trim|required|max_length[250]');
    ci.fv.setRules('comment', 'Comment', 'trim|required|max_length[1000]');
    if ((await ci.fv.run()) === true) {
      const orderId = intval(ci.input.post('order_id'));
      const reasonId = ci.input.post('reason_id');
      const ord = await m.getOrderMaster(ci.db, orderId);
      if (ord && (eq(ord.customers_id, ci.userId) || eq(ord.added_by, ci.userId))) {
        const reason = await m.dbFieldValue(ci.db, 'wl_reasons', 'reason_name', sql` AND reason_id=${str(reasonId)} `);
        const update = clean(ci, {
          reason,
          reason_id: reasonId,
          reason_comment: ci.input.post('comment'),
          request_date: now(ci),
          order_status: 'Cancelled',
        });
        await m.updateRows(ci.db, 'wl_order', update, sql`\`order_id\` = ${str(orderId)}`);
        data.success = 'true';
        data.message = 'Order has been cancelled successfully.';
      } else {
        data.success = 'false';
        data.error = ci.lang('invalid_order');
      }
    } else {
      data.success = 'false';
      data.error = firstValidationError(ci);
    }
  } else {
    data.success = 'false!';
    data.error = 'Parameter missing';
  }
  ci.out.json(data);
}

/** return_product — order_id, product_id, reason_id, comment, action=return_product */
async function returnProduct(req) {
  const { ci } = req;
  setup(ci);
  const data = {};
  if (actionIs(ci, 'return_product')) {
    ci.fv.setRules('order_id', ci.lang('order_id'), 'trim|required|max_length[1000]');
    ci.fv.setRules('product_id', ci.lang('product_id'), 'trim|required|max_length[1000]');
    ci.fv.setRules('reason_id', ci.lang('reason'), 'trim|required|max_length[250]');
    ci.fv.setRules('comment', ci.lang('comment'), 'trim|required|max_length[1000]');
    if ((await ci.fv.run()) === true) {
      const prodId = intval(ci.input.post('product_id'));
      const orderId = intval(ci.input.post('order_id'));
      const reasonId = ci.input.post('reason_id');
      const ord = await m.getOrderMaster(ci.db, orderId);
      if (ord && eq(ord.customers_id, ci.userId)) {
        // $this->language_id is not defined on the controller (NULL)
        const reason = await m.dbFieldValue(ci.db, 'wl_reasons_lang', 'reason_name', sql` AND reason_id=${str(reasonId)} AND language_id=${''} `);
        const update = clean(ci, { reason, reason_comment: ci.input.post('comment'), request_date: now(ci), is_return: '1' });
        await m.updateRows(ci.db, 'wl_orders_products', update, sql`\`orders_products_id\` = ${str(prodId)} AND \`orders_id\` = ${str(orderId)}`);
        data.success = 'true';
        data.message = ci.lang('product_order_has_been_returned');
      } else {
        data.success = 'false';
        data.error = ci.lang('invalid_order');
      }
    } else {
      data.success = 'false';
      data.error = firstValidationError(ci);
    }
  } else {
    data.success = 'false!';
    data.error = 'Parameter missing';
  }
  ci.out.json(data);
}

/** return_order — order_id, reason_id, comment, action=return_order */
async function returnOrder(req) {
  const { ci } = req;
  setup(ci);
  const data = {};
  if (actionIs(ci, 'return_order')) {
    ci.fv.setRules('order_id', ci.lang('order_id'), 'trim|required|max_length[1000]');
    ci.fv.setRules('reason_id', ci.lang('reason'), 'trim|required|max_length[250]');
    ci.fv.setRules('comment', ci.lang('comment'), 'trim|required|max_length[1000]');
    if ((await ci.fv.run()) === true) {
      const orderId = intval(ci.input.post('order_id'));
      const reasonId = ci.input.post('reason_id');
      const ord = await m.getOrderMaster(ci.db, orderId);
      if (ord && eq(ord.customers_id, ci.userId)) {
        let isReturnShow = '0';
        if (ord.order_status === 'Delivered') {
          const toTime = strtotime(phpDate('Y-m-d H:i:s'));
          // wl_order has no delivered_date column: strtotime(NULL) === false
          const delivered = ord.delivered_date === undefined ? null : ord.delivered_date;
          const fromTime = delivered === null ? false : strtotime(delivered);
          const min = round((num(toTime) - num(fromTime)) / 60);
          isReturnShow = min > 30 ? '0' : '1';
        }
        if (num(isReturnShow) > 0) {
          const reason = await m.dbFieldValue(ci.db, 'wl_reasons_lang', 'reason_name', sql` AND reason_id=${str(reasonId)} AND language_id=${''} `);
          const update = clean(ci, {
            reason,
            reason_id: reasonId,
            reason_comment: ci.input.post('comment'),
            request_date: now(ci),
            order_status: 'Returned',
          });
          await m.updateRows(ci.db, 'wl_order', update, sql`\`order_id\` = ${str(orderId)}`);
          await m.getOrderMaster(ci.db, orderId);
          await m.getOrderDetail(ci.db, orderId);
          ci.out.showError('Unable to locate the model you have specified: Export_model');
        } else {
          data.success = 'false';
          data.error = ci.lang('product_order_has_not_been_returned');
        }
      } else {
        data.success = 'false';
        data.error = ci.lang('invalid_order');
      }
    } else {
      data.success = 'false';
      data.error = firstValidationError(ci);
    }
  } else {
    data.success = 'false!';
    data.error = 'Parameter missing';
  }
  ci.out.json(data);
}

/** orders — customer_type, member_id, from_date, to_date, order_no, limits, keyword, order_status, customers_id */
async function orders(req) {
  const { ci } = req;
  setup(ci);
  let err = 0;
  let errMsg = '';
  const data = {};
  const customerType = intval(ci.input.getPost('customer_type'));
  const memberId = intval(ci.input.getPost('member_id'));
  let condition;
  if (customerType > 0) {
    condition = sql`AND added_by = ${str(ci.userId)} `;
    if (memberId > 0) condition = sql`${condition}AND customers_id = ${str(memberId)} `;
  } else {
    condition = sql`AND customers_id = ${str(ci.userId)} `;
  }
  const fromDate = trim(ci.input.getPost('from_date', true));
  const toDate = trim(ci.input.getPost('to_date', true));
  if (fromDate !== '' || toDate !== '') {
    if (fromDate !== '' && toDate !== '' && phpGreater(fromDate, toDate)) {
      err = 1;
      errMsg = 'From date should be less than to date';
    }
    const parts = [];
    if (fromDate !== '') parts.push(sql`DATE(order_received_date)>=${fromDate}`);
    if (toDate !== '') parts.push(sql`DATE(order_received_date)<=${toDate}`);
    condition = sql`${condition} AND (${sql.join(parts, sql` AND `)} )`;
  }
  const orderNo = trim(ci.input.getPost('order_no', true));
  if (orderNo !== '') condition = sql`${condition} AND ( invoice_number = ${orderNo})`;

  if (err === 0) {
    let limits = intval(ci.input.getPost('limits'));
    limits = limits > 0 ? limits : 5000;
    const { rows, total } = await m.getOrders(ci, 0, limits, condition);
    data.totalorder = total;
    if (rows) {
      data.totalorder = rows.length;
      const resa = [];
      for (const ord of rows) {
        let amount = num(ord.total_amount) - num(ord.coupon_discount_amount);
        amount = amount + num(ord.shipping_amount) + num(ord.vat_amount);
        amount = numberFormat(amount, 2, '.', '');
        data.grand_total = amount;
        ord.total_amount = amount;
        ord.order_received_date = getDateFormat(ord.order_received_date, 2);
        ord.is_cancel_show = ord.order_status === 'Ready For Dispatch' || ord.order_status === 'Pending' ? '1' : '0';
        const details = await m.firstOrderProduct(ci.db, ord.order_id);
        const resa1 = [];
        for (const val of details) {
          if (val.product_image !== undefined && val.product_image !== null) await attachMedia(ci, val);
          val.payment_method = ord.payment_method;
          val.order_status = ord.order_status;
          resa1.push(val);
        }
        ord.orddetail = resa1;
        resa.push(ord);
      }
      data.res = resa;
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
  data.currency_code = await m.defaultCurrencyField(ci.db, 'code');
  data.currency_symbol_left = await m.defaultCurrencyField(ci.db, 'symbol_left');
  ci.out.json(data);
}

/** print_invoice — order_id */
async function printInvoice(req) {
  const { ci } = req;
  setup(ci);
  const data = {};
  data.mres = await m.getMembers(ci, 1, 0, { status: '1', customer_id: ci.userId });
  const orderId = ci.input.getPost('order_id');
  const ord = await m.getOrderMaster(ci.db, intval(orderId));
  const details = await m.getOrderDetail(ci.db, orderId);
  if (ord) {
    data.success = 'true';
    data.ordmaster = ord;
    let resa = null;
    if (details) {
      resa = [];
      for (const val of details) {
        if (val.product_image !== undefined && val.product_image !== null) await attachMedia(ci, val, { brokenTable: true, setProductImage: false });
        resa.push(val);
      }
    } else {
      foreachWarning(ci, 1549);
    }
    data.orddetail = resa;
    const adminRes = await getDbSingleRow(ci.db, 'tbl_admin as ta, tbl_admin_lang as tal', '*', sql` and ta.admin_id =1 and tal.language_id=${str(ord.language_id)} `, ci.out);
    if (adminRes) data.admin_res = adminRes;
    data.product_image_path = productImagePath(ci);
    data.product_no_image_path = noImagePath(ci);
  } else {
    data.error = ci.lang('no_record_found');
    data.success = 'false';
  }
  ci.out.json(data);
}

/** invoice — order_id */
async function invoice(req) {
  const { ci } = req;
  setup(ci);
  const data = {};
  const orderId = ci.input.getPost('order_id');
  const ord = await m.getOrderMaster(ci.db, intval(orderId));
  const details = await m.getOrderDetail(ci.db, orderId);
  if (ord) {
    let amount = num(ord.total_amount) - num(ord.coupon_discount_amount);
    amount = amount + num(ord.shipping_amount) + num(ord.vat_amount);
    amount = numberFormat(amount, 2, '.', '');
    data.success = 'true';
    data.grand_total = amount;
    data.ordmaster = ord;
    let resa = null;
    if (details) {
      resa = [];
      for (const val of details) {
        if (val.product_image !== undefined && val.product_image !== null) await attachMedia(ci, val);
        val.payment_method = ord.payment_method;
        val.order_status = ord.order_status;
        resa.push(val);
      }
    } else {
      foreachWarning(ci, 1620);
    }
    data.orddetail = resa;
    const adminRes = await getDbSingleRow(ci.db, 'tbl_admin', '*', " and admin_id ='1' ", ci.out);
    if (adminRes) data.admin_res = adminRes;
    data.product_image_path = productImagePath(ci);
    data.product_no_image_path = noImagePath(ci);
  } else {
    data.success = 'false';
    data.error = 'No record founds';
  }
  data.currency_code = await m.defaultCurrencyField(ci.db, 'code');
  data.currency_symbol_left = await m.defaultCurrencyField(ci.db, 'symbol_left');
  ci.out.json(data);
}

/** track_order — order_id */
async function trackOrder(req) {
  const { ci } = req;
  setup(ci);
  const ord = await m.getOrderMaster(ci.db, intval(ci.input.getPost('order_id')));
  if (ord) {
    // $this->load->model('transporter/transporter_model'): the model file does not exist
    ci.out.showError('Unable to locate the model you have specified: Transporter_model');
  }
  ci.out.json({ success: 'false', res: [], error: 'No Records Found !' });
}

/* ------------------------------------------------------------------ support / notifications */

/** member_support_old */
async function memberSupportOld(req) {
  const { ci } = req;
  setup(ci);
  const rows = await m.getSupports(ci, sql` member_id = ${str(ci.userId)} `);
  const data = {};
  if (rows.length) {
    data.success = 'true';
    data.res = rows.map((v) => {
      v.post_date = getDateFormat(v.post_date, 2);
      v.reply_date = str(v.reply_date) !== '' ? getDateFormat(v.reply_date, 2) : '';
      return v;
    });
    // PHP assigned success before res
  } else {
    data.error = ci.lang('no_record_found');
    data.success = 'false';
  }
  ci.out.json(data);
}

/** post_support_old — comment, action=add_support */
async function postSupportOld(req) {
  const { ci } = req;
  setup(ci);
  const data = {};
  if (actionIs(ci, 'add_support')) {
    ci.fv.setRules('comment', 'Message', 'trim|required|max_length[10000]');
    if ((await ci.fv.run()) === true) {
      const poster = await getDbSingleRow(ci.db, 'wl_customers', 'first_name,user_name,customer_type', { customers_id: ci.userId }, ci.out);
      const posted = clean(ci, {
        comment: ci.input.post('comment', true),
        member_id: ci.userId,
        customer_type: poster ? poster.customer_type : null,
        name: poster ? poster.first_name : null,
        email: poster ? poster.user_name : null,
        status: '1',
        post_date: now(ci),
      });
      await m.insertRow(ci.db, 'wl_supports', posted);
      data.success = 'true';
      data.message = 'Your support has been posted successfully.';
    } else {
      data.success = 'false';
      data.error = firstValidationError(ci);
    }
  } else {
    data.success = 'false';
    data.error = 'parameter missing';
  }
  ci.out.json(data);
}

/** member_support — offset (POST) */
async function memberSupport(req) {
  const { ci } = req;
  setup(ci);
  let offset = intval(ci.input.post('offset'));
  offset = offset <= 0 ? 1 : offset;
  const perPage = 700;
  const offsetRec = (offset - 1) * perPage;
  const baseWhere = sql`inq.customer_id=${str(ci.userId)} AND inq.status!='2'`;
  const { rows: groups, total } = await m.getSupportInquiry(ci.db, {
    fields: 'inq.receive_date',
    offset: offsetRec,
    limit: perPage,
    where: baseWhere,
    groupby: 'DATE(inq.receive_date)',
    orderby: 'inq.receive_date DESC',
  });
  const myMessages = [];
  const data = {};
  if (total > 0) {
    for (const val1 of groups) {
      const day = phpDate('Y-m-d', num(strtotime(val1.receive_date)));
      const { rows } = await m.getSupportInquiry(ci.db, {
        fields: 'inq.id,inq.customer_id,inq.posted_by,inq.reply_status,inq.receive_date,inq.message',
        where: sql`inq.customer_id=${str(ci.userId)} AND inq.status!='2' AND DATE(inq.receive_date)=${day}`,
        orderby: 'inq.receive_date ASC',
      });
      let messages = rows;
      if (rows) {
        for (const r of rows) r.time_text = phpDate('h:i A', num(strtotime(r.receive_date)));
      } else {
        foreachWarning(ci, 1065);
        messages = null;
      }
      myMessages.push({ group_date: phpDate('M d,Y', num(strtotime(val1.receive_date))), messages });
    }
    data.success = 'true';
  } else {
    data.success = 'false';
    data.error = ci.lang('no_record_found');
  }
  data.total_inquiry = total;
  data.total_pages = Math.ceil(total / perPage);
  data.offset = offset;
  data.res = myMessages;
  ci.out.json(data);
}

/** post_support — message, action=add_support */
async function postSupport(req) {
  const { ci } = req;
  setup(ci);
  const data = {};
  if (actionIs(ci, 'add_support')) {
    ci.fv.setRules('message', 'Message', 'trim|required|max_length[10000]');
    if ((await ci.fv.run()) === true) {
      const poster = await getDbSingleRow(ci.db, 'wl_customers', 'first_name,user_name,customer_type,mobile_number', { customers_id: ci.userId }, ci.out);
      const posted = clean(ci, {
        customer_id: ci.userId,
        posted_by: 'U',
        member_type: poster ? poster.customer_type : null,
        email: poster ? poster.user_name : null,
        first_name: poster ? poster.first_name : null,
        mobile_number: poster ? poster.mobile_number : null,
        message: ci.input.post('message', true),
        receive_date: now(ci),
      });
      await m.insertRow(ci.db, 'wl_support_enquiry', posted);
      data.success = 'true';
      data.message = 'Your support has been posted successfully.';
    } else {
      data.success = 'false';
      data.error = firstValidationError(ci);
    }
  } else {
    data.success = 'false';
    data.error = 'parameter missing';
  }
  ci.out.json(data);
}

/** count_notification */
async function countNotification(req) {
  const { ci } = req;
  setup(ci);
  await m.getMemberNotifications(ci, sql` member_id = ${str(ci.userId)} AND  is_read='0' `);
  const total = await getFoundRows(ci.db);
  ci.out.json({ success: 'true', notification_count: total });
}

/** member_notification — marks the member's notifications read */
async function memberNotification(req) {
  const { ci } = req;
  setup(ci);
  const rows = await m.getMemberNotifications(ci, sql` member_id = ${str(ci.userId)} `);
  const data = {};
  if (rows.length) {
    await m.updateRows(ci.db, 'wl_member_notifications', { is_read: '1' }, sql`\`member_id\` = ${str(ci.userId)} `);
    data.success = 'true';
    data.res = rows.map((v) => {
      v.post_date = getDateFormat(v.post_date, 2);
      return v;
    });
  } else {
    data.error = ci.lang('no_record_found');
    data.success = 'false';
  }
  ci.out.json(data);
}

/** notification — Members_model::get_member_notification() does not exist (PHP fatal error). */
async function notification(req) {
  const { ci } = req;
  setup(ci);
  ci.out.fatalError('Call to undefined method Members_model::get_member_notification()', FILE, 1843);
}

/** count_notificationssss */
async function countNotificationssss(req) {
  const { ci } = req;
  setup(ci);
  const rows = await m.countUnreadNotifications(ci.db, ci.userId);
  const data = {};
  if (rows.length) {
    data.success = 'true';
    data.total_notinfication = rows[0].total_rows;
  } else {
    data.success = 'false';
    data.total_notinfication = 0;
  }
  ci.out.json(data);
}

/* ------------------------------------------------------------------ reviews / coupons / rewards / referral */

/** product_feedback — keyword */
async function productFeedback(req) {
  const { ci } = req;
  setup(ci);
  const data = {};
  const list = await m.getMemberReviews(ci, ci.userId);
  if (list.length) {
    data.review_count = list.length;
    const out = [];
    for (const v of list) {
      const rows = await m.productDefaultMedia(ci.db, v.entity_id);
      if (rows.length > 0 && str(rows[0].media) !== '' && m.productImageExists(rows[0].media)) v.media = rows[0].media;
      else v.media = '';
      v.posted_date = getDateFormat(v.posted_date, 1);
      out.push(v);
    }
    data.list_review = out;
    data.success = 'true';
  } else {
    data.success = 'false';
    data.review_count = 0;
    data.list_review = [];
  }
  data.product_image_path = productImagePath(ci);
  data.product_no_image_path = noImagePath(ci);
  ci.out.json(data);
}

/** member_coupons — per_page, offset (POST) */
async function memberCoupons(req) {
  const { ci } = req;
  setup(ci);
  const perPagePost = ci.input.post('per_page');
  const recordPerPage = intval(perPagePost) ? perPagePost : 5000;
  const perPage = num(recordPerPage) > 0 ? recordPerPage : ci.config('per_page');
  const offset = intval(ci.input.post('offset'));
  const limit = perPage;
  const today = phpDate('Y-m-d');
  const uid = str(ci.userId);
  const where = sql`\`wlc\`.\`status\` ='1' AND \`wlc\`.\`end_date\` >= ${today} AND ((wlc.coupon_for = '0') OR (wlc.coupon_for = '1' AND wlcc.customer_id =${uid} AND wlc.coupon_usage = 'multiple') OR (wlc.coupon_for = '1' AND wlcc.customer_id =${uid} AND wlc.coupon_usage = 'single' AND wlcc.status = '0'))`;
  const res = await m.getDiscountCoupon(ci, offset, limit, where);
  const totalRows = await getFoundRows(ci.db);
  const data = {};
  const isRow = res !== null && typeof res === 'object' && !Array.isArray(res);
  if ((Array.isArray(res) && res.length) || (isRow && Object.keys(res).length)) {
    data.success = 'true';
    data.total_pages = Math.ceil(num(totalRows) / num(recordPerPage)) - 1;
    data.record_per_page = recordPerPage;
    data.total_rows = totalRows;
    await m.defaultCurrencyField(ci.db, 'code');
    await m.defaultCurrencyField(ci.db, 'symbol_left');
    if (isRow) {
      // per_page == 1: the model returned one row, so PHP looped over its column values (strings).
      data.res = Object.values(res).map((v) => couponOnScalar(ci, v));
    } else {
      data.res = res.map((v) => {
        v.start_date = getDateFormat(v.start_date, 1);
        v.end_date = getDateFormat(v.end_date, 1);
        v.coupon_discount = intval(v.coupon_discount);
        v.coupon_discount_txt = eq(v.coupon_type, 'p') ? `${v.coupon_discount}%` : v.coupon_discount;
        v.minimum_order_amount = num(v.minimum_order_amount) > 0 ? v.minimum_order_amount : '0.00';
        v.maximum_coupon_discount = num(v.maximum_coupon_discount) > 0 ? v.maximum_coupon_discount : '0.00';
        return v;
      });
    }
  } else {
    data.success = 'false';
    data.total_rows = totalRows;
    data.res = [];
    data.error = 'No Records Found !';
  }
  ci.out.json(data);
}

/**
 * member_coupons() loop body applied to a scalar column value (PHP 5.6 string-offset semantics): reading
 * $v['key'] on a string warns "Illegal string offset" and yields $v[0]; writing warns and replaces $v[0] with
 * the first character of the value; NULL or "" silently become an array.
 */
function couponOnScalar(ci, value) {
  let v = value;
  const warn = (key, line) => ci.out.phpWarning(`Illegal string offset '${key}'`, SHORT_FILE, line, {
    frames: [null, null, { file: FILE, line, fn: '_error_handler' }, null, null, { file: 'index.php', line: 304, fn: 'require_once' }],
  });
  const isStr = () => typeof v === 'string' && v !== '';
  const read = (key, line) => {
    if (isStr()) {
      warn(key, line);
      return v[0];
    }
    if (v !== null && typeof v === 'object') return v[key] === undefined ? null : v[key];
    return null;
  };
  const write = (key, val, line) => {
    if (isStr()) {
      warn(key, line);
      const s = str(val);
      if (s !== '') v = s[0] + v.slice(1);
      return;
    }
    if (v === null || v === '') v = {};
    v[key] = val;
  };
  write('start_date', getDateFormat(read('start_date', 2029), 1), 2029);
  write('end_date', getDateFormat(read('end_date', 2030), 1), 2030);
  write('coupon_discount', intval(read('coupon_discount', 2032)), 2032);
  const aP = eq(read('coupon_type', 2034), 'p') ? `${str(read('coupon_discount', 2034))}%` : read('coupon_discount', 2034);
  write('coupon_discount_txt', aP, 2038);
  const min = read('minimum_order_amount', 2040);
  write('minimum_order_amount', num(min) > 0 ? read('minimum_order_amount', 2040) : '0.00', 2040);
  const max = read('maximum_coupon_discount', 2042);
  write('maximum_coupon_discount', num(max) > 0 ? read('maximum_coupon_discount', 2042) : '0.00', 2042);
  return v;
}

/** rewards_point — the members/wallets helper has no get_total_earn_amount() (PHP fatal error). */
async function rewardsPoint(req) {
  const { ci } = req;
  setup(ci);
  ci.out.fatalError('Call to undefined function get_total_earn_amount()', FILE, 2067);
}

/** refer_friend — friend_name, friend_email, friend_mobile, action=refer_friend */
async function referFriend(req) {
  const { ci } = req;
  setup(ci);
  const data = {};
  if (actionIs(ci, 'refer_friend')) {
    ci.fv.setRules('friend_name', ci.lang('friend_name'), 'trim|required|alpha|max_length[100]');
    ci.fv.setRules('friend_email', ci.lang('friend_email'), 'trim|required|valid_email|max_length[100]');
    ci.fv.setRules('friend_mobile', ci.lang('friend_mobile'), 'trim|max_length[14]');
    if (await ci.fv.run()) {
      const userId = ci.userId;
      const yourName = ucwords(ci.user.name);
      const yourEmail = ci.user.user_name;
      const friendName = ci.input.post('friend_name', true);
      const friendEmail = ci.input.post('friend_email', true);
      const friendMobile = ci.input.post('friend_mobile', true);
      const count = await m.countReferrals(ci.db, yourEmail, friendEmail, userId);
      if (count === 0 && num(userId) > 0) {
        const content = await getContent(ci.db, 'wl_auto_respond_mails', '3');
        let body = content ? content.email_content : null;
        const referralCode = ci.user.referral_code === undefined ? null : ci.user.referral_code;
        const existing = await m.findReferral(ci.db, friendEmail, yourEmail);
        if (existing.length === 0) {
          const posted = clean(ci, {
            posted_user: yourEmail,
            posted_name: yourName,
            refer_user: friendEmail,
            refer_name: friendName,
            refer_mobile: friendMobile,
            poster_id: userId,
            referral_code: referralCode,
            is_approved: '1',
            refer_date: now(ci),
          });
          await m.insertRow(ci.db, 'wl_referral_customers', posted);
        }
        const linkUrl = `<a href=${ci.baseUrl()}>Click here </a>`;
        const referl =
          str(referralCode) !== ''
            ? `<b>Your referral code is <b>${str(referralCode)} <b/>.If you want to refer ${yourName}. Please use this referral code at the time of registration.<br/><br/>`
            : '';
        const rep = (s, a, b) => str(s).split(a).join(str(b));
        body = rep(body, '{friend_name}', friendName);
        body = rep(body, '{your_name}', yourName);
        body = rep(body, '{site_name}', ci.config('site_name'));
        body = rep(body, '{text}', 'Site');
        body = rep(body, '{site_link}', linkUrl);
        body = rep(body, '{referral_code}', referl);
        mailNotify({
          subject: `Invitation from ${yourName} to see`,
          to_email: friendEmail,
          from_email: yourEmail,
          from_name: yourName,
          body_part: body,
        });
        data.success = 'true';
        data.message = ci.lang('you_have_referred_your_friend_successfully');
      } else {
        data.success = 'false';
        data.error = 'You have already referred this friend earlier.';
      }
    } else {
      data.success = 'false';
      data.error = firstValidationError(ci);
    }
  } else {
    data.success = 'false';
    data.error = 'parameter missing';
  }
  ci.out.json(data);
}

module.exports = {
  index,
  memberTopheader,
  editAccount,
  updateImage,
  faceAuthotication,
  addresses,
  deleteAddress,
  addAddress,
  editAddress,
  routeEmailCheck,
  routeMobileCheck,
  routeValidMobile,
  routeValidArea,
  routeSmepwdCheck,
  routeOldpwdCheck,
  changePassword,
  wishlist,
  deleteMemberWishlist,
  reasonList,
  cancelOrder,
  membersListing,
  memberSupportOld,
  postSupportOld,
  memberSupport,
  postSupport,
  countNotification,
  memberNotification,
  returnProduct,
  returnOrder,
  orders,
  printInvoice,
  invoice,
  productFeedback,
  adminDetails,
  deviceRegistration,
  routeCheckPriceZero,
  notification,
  countNotificationssss,
  referFriend,
  memberCoupons,
  rewardsPoint,
  trackOrder,
  deleteOwnAccounts,
};
