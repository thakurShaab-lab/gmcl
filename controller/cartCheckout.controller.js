/**
 * modules/api/controllers/Cart.php — second half: delivery info, payment form, order placement, invoices
 * (add_deliveryinfo … show_top_cart). The basket half lives in cart.controller.js.
 */
const fs = require('fs');
const path = require('path');
const env = require('../config/env');
const orderModel = require('../model/order.model');
const { orderInvoiceContent } = require('../utils/invoice');
const { getImage } = require('../utils/thumbnail');
const { mailNotify } = require('../utils/mailer');
const { xssClean } = require('../utils/xssClean');
const { str, num, intval, eq, neq, toBool, numberFormat } = require('../utils/php');
const { sql } = require('drizzle-orm');

const CART_FILE = 'controllers/Cart.php';


/** PHP truthiness of $this->userId / $user_id. */
const truthy = (v) => toBool(v);

/** @array_key_exists(k, $row) ? $row[k] : $default */
const keyOr = (row, key, def) => (row && Object.prototype.hasOwnProperty.call(row, key) ? row[key] : def);

/** $rows[0] on a findAll() result (null when there were no rows). */
const first = (rows) => (Array.isArray(rows) && rows.length ? rows[0] : null);

/** str_replace(array("&nbsp;", "\n"), "", @$err_arr[0]) */
const firstErrorText = (ci) => str(ci.fv.firstError()).split('&nbsp;').join('').split('\n').join('');

/**
 * Shared cart summary of add_deliveryinfo()/deliveryinfo(). Returns false when the cart is empty (data already
 * holds the error), true otherwise.
 */
async function deliveryCartSummary(ci, data, userId) {
  const { db } = ci;
  const cartRes = await orderModel.cartRows(db, { userId });
  if (!(cartRes.length > 0)) {
    data.success = 'false';
    data.error = 'Your cart is empty.';
    return false;
  }
  data.success = 'true';
  const couponRes = await orderModel.tempRow(db, 'coupon', 'or', userId, ci.appId);
  const shipRes = await orderModel.tempRow(db, 'shipping', 'or', userId, ci.appId);
  const shippingAmount = shipRes ? keyOr(shipRes, 'shipment_rate', '') : '';

  const cartTotalRes = truthy(userId)
    ? await orderModel.cartTotal(db, { userId })
    : await orderModel.cartTotal(db, { appId: ci.appId, byApp: true, doubleApp: true });
  let discountAmount = '0';
  let cartTotal = cartTotalRes ? cartTotalRes.carttotal : null;
  data.cart_res = cartRes;
  data.cart_subtotal = cartTotal;
  data.shipping_amount = shippingAmount;
  data.discount_amount = discountAmount;
  if (couponRes) {
    data.coupon_type = couponRes.coupon_type;
    discountAmount = couponRes.discount_amount;
    data.discount_amount = discountAmount;
    data.coupon_title = couponRes.coupon_type === 'Voucher' ? ci.lang('cashback_amount') : ci.lang('discount_amount');
  }
  cartTotal = num(cartTotal) + num(shippingAmount) - num(discountAmount);
  const taxCent = '0';
  data.tax_cent = taxCent;
  const tax = (cartTotal * num(taxCent)) / 100;
  data.total_tax_cent = tax;
  data.final_cart_amount = numberFormat(cartTotal + tax, 2, '.', '');
  return true;
}

/** GET|POST /api/cart/add_deliveryinfo — salesman delivery address (member_id, instruction, address, action) */
async function addDeliveryinfo(req) {
  const { ci } = req;
  const { db } = ci;
  const appType = num(ci.appType) > 0 ? ci.appType : ci.input.getPost('app_type');
  const userId = ci.userId;
  await orderModel.getMemberRow(db, userId);
  let addressId = intval(ci.input.getPost('address_id'));
  let shipData = [];
  const appId = ci.appId;
  const data = {};

  if (await deliveryCartSummary(ci, data, userId)) {
    data.delivery_address = shipData;
    if (toBool(ci.input.post('action'))) {
      ci.fv.setRules('member_id', 'Member Id', 'trim|required|max_length[50]');
      ci.fv.setRules('instruction', 'Instruction', 'trim|max_length[500]');
      ci.fv.setRules('address', 'Address', 'trim|required|max_length[500]');
      if ((await ci.fv.run()) === true) {
        const customerType = ci.input.getPost('customer_type');
        const memberId = num(customerType) > 0 ? ci.input.getPost('member_id') : userId;
        const mresAdd = await orderModel.getMemberRow(db, memberId);
        let shipping = {
          user_id: ci.input.post('member_id', true),
          instruction: ci.input.post('instruction', true),
          address: ci.input.post('address', true),
          address_type: 'Ship',
          first_name: mresAdd ? mresAdd.first_name : null,
          last_name: mresAdd ? mresAdd.last_name : null,
          mobile: mresAdd ? mresAdd.mobile_number : null,
        };
        shipping = xssClean(shipping, ci.requestUri);

        shipData = first(await orderModel.getMemberAddressBookSalesman(db, ci.input.getPost('member_id'), 'Ship', addressId, '', userId));
        addressId = shipData ? shipData.address_id : null;
        if (num(addressId) > 0) {
          shipping.added_by = ci.userId;
          shipping.app_id = appId;
          shipping.app_type = appType;
          await orderModel.rawUpdate(
            db,
            'tbl_temp_salesman_delivery_address',
            shipping,
            sql`added_by =${str(userId)} AND user_id =${str(memberId)} AND id=${str(addressId)} AND address_type='Ship'`,
          );
        } else {
          shipping.added_by = ci.userId;
          shipping.app_id = appId;
          shipping.app_type = appType;
          shipping.reciv_date = ci.config('config.date.time');
          addressId = await orderModel.rawInsert(db, 'tbl_temp_salesman_delivery_address', shipping);
        }
        shipData = first(await orderModel.getMemberAddressBookSalesman(db, ci.input.getPost('member_id'), 'Ship', addressId, '', userId));
        data.delivery_address = shipData;
        data.message = num(addressId) > 0 ? 'Delivery information added successfully.' : 'Delivery information updated successfully.';
        data.payment_form_link = `${ci.baseUrl()}api/cart/procced_payment_form?user_id=${str(userId)}&address_id=${str(addressId)}&member_id=${str(
          ci.input.getPost('member_id'),
        )}&customer_type=${str(ci.input.getPost('customer_type'))}`;
        data.address_id = addressId;
      } else {
        data.success = 'false';
        data.delivery_address = shipData;
        data.error = firstErrorText(ci);
      }
    } else {
      data.success = 'false';
      data.error = 'parameter missing';
      data.delivery_address = shipData;
    }
  }
  ci.out.json(data);
}

/** Address-book row of the current user (guest temp address when login_type is 1). */
async function ownAddress(ci, userId, addressId, defaultStatus) {
  if (eq(ci.loginType, '1')) return first(await orderModel.getMemberAddressBookGuest(ci.db, userId, 'Ship', addressId));
  return first(await orderModel.getMemberAddressBook(ci.db, userId, 'Ship', addressId, defaultStatus));
}

/** GET|POST /api/cart/deliveryinfo — customer's own delivery address (first_name … pin_code, action) */
async function deliveryinfo(req) {
  const { ci } = req;
  const { db } = ci;
  const appType = num(ci.appType) > 0 ? ci.appType : ci.input.getPost('app_type');
  const userId = ci.userId;
  await orderModel.getMemberRow(db, userId);
  let addressId = intval(ci.input.getPost('address_id'));
  let shipData = await ownAddress(ci, userId, addressId, 'Y');
  const appId = ci.appId;
  const data = {};

  if (await deliveryCartSummary(ci, data, userId)) {
    data.delivery_address = shipData;
    if (toBool(ci.input.post('action'))) {
      ci.fv.setRules('first_name', 'First Name', 'trim|required|alpha|max_length[32]');
      ci.fv.setRules('last_name', 'Last Name', 'trim|alpha|max_length[32]');
      ci.fv.setRules('address', 'Address', 'trim|required|max_length[200]');
      ci.fv.setRules('mobile', 'Mobile', 'trim|required|max_length[15]');
      ci.fv.setRules('state', 'State', 'trim|required|max_length[50]');
      ci.fv.setRules('city', 'City', 'trim|required|max_length[50]');
      ci.fv.setRules('landmark', 'Landmark', 'trim|required|max_length[50]');
      ci.fv.setRules('pin_code', 'Pin Code', 'trim|required|max_length[10]');
      if ((await ci.fv.run()) === true) {
        let shipping = {
          first_name: ci.input.post('first_name', true),
          last_name: ci.input.post('last_name', true),
          address: ci.input.post('address', true),
          zipcode: ci.input.post('pin_code', true),
          phone: ci.input.post('mobile', true),
          mobile: ci.input.post('mobile', true),
          city_id: ci.input.post('city', true),
          city: await orderModel.fieldValue(db, 'wl_cities', 'title', { id: ci.input.post('city') }),
          state: ci.input.post('state', true),
          landmark: ci.input.post('landmark'),
          address_type: 'Ship',
          reciv_date: ci.config('config.date.time'),
        };
        shipping = xssClean(shipping, ci.requestUri);
        const guest = eq(ci.loginType, '1');
        if (addressId > 0) {
          if (guest) {
            shipping.user_id = ci.userId;
            shipping.app_id = appId;
            shipping.app_type = appType;
            await orderModel.rawUpdate(db, 'tbl_temp_delivery_address', shipping, sql`user_id =${str(userId)} AND id=${str(addressId)} AND address_type='Ship'`);
          } else {
            shipping.default_status = 'Y';
            shipping.customer_id = ci.userId;
            await orderModel.rawUpdate(
              db,
              'wl_customers_address_book',
              shipping,
              sql`customer_id =${str(userId)} AND address_id=${str(addressId)} AND address_type='Ship'`,
            );
          }
        } else if (guest) {
          shipping.user_id = ci.userId;
          shipping.app_id = appId;
          shipping.app_type = appType;
          shipping.reciv_date = ci.config('config.date.time');
          addressId = await orderModel.rawInsert(db, 'tbl_temp_delivery_address', shipping);
        } else {
          shipping.default_status = 'Y';
          shipping.customer_id = ci.userId;
          shipping.reciv_date = ci.config('config.date.time');
          addressId = await orderModel.rawInsert(db, 'wl_customers_address_book', shipping);
        }
        shipData = await ownAddress(ci, userId, addressId, 'Y');
        data.delivery_address = shipData;
        // PHP tested an undefined $id here, so this is always the "updated" text.
        data.message = 'Delivery information updated successfully.';
        data.payment_form_link = `${ci.baseUrl()}api/cart/procced_payment_form?user_id=${str(userId)}&address_id=${str(addressId)}`;
        data.address_id = addressId;
      } else {
        data.success = 'false';
        data.delivery_address = shipData;
        data.error = firstErrorText(ci);
      }
    } else {
      data.success = 'false';
      data.error = 'parameter missing';
      data.delivery_address = shipData;
    }
  }
  ci.out.json(data);
}

async function defaultCurrency(db, data) {
  data.currency_code = await orderModel.fieldValue(db, 'wl_currencies', 'code', { is_default: 'Y' });
  data.currency_symbol_left = await orderModel.fieldValue(db, 'wl_currencies', 'symbol_left', { is_default: 'Y' });
}

/** GET|POST /api/cart/procced_payment_form — address_id, customer_type, member_id, instruction */
async function proccedPaymentForm(req) {
  const { ci } = req;
  const { db } = ci;
  const appId = ci.appId;
  const userId = truthy(ci.userId) ? ci.userId : '';
  const customerType = intval(ci.input.getPost('customer_type'));
  const addressId = intval(ci.input.getPost('address_id'));
  const data = { address_id: addressId };

  const byApp = !truthy(userId);
  const cartRes = await orderModel.cartRows(db, { userId, appId, byApp });
  if (cartRes.length === 0) {
    data.success = 'false';
    data.error = 'Your cart is empty';
  } else {
    const mode = byApp ? 'app' : 'and';
    const couponRes = await orderModel.tempRow(db, 'coupon', mode, userId, appId);
    const shipRes = await orderModel.tempRow(db, 'shipping', mode, userId, appId);
    const shippingAmount = shipRes ? keyOr(shipRes, 'shipment_rate', '') : '';
    const cartTotalRes = await orderModel.cartTotal(db, { userId, appId, byApp });
    const discountAmount = '0';
    data.success = 'true';
    let shipData;
    if (customerType > 0) {
      const memberId = ci.input.getPost('member_id');
      shipData = first(await orderModel.getMemberAddressBookSalesman(db, memberId, 'Ship', addressId, '', userId));
    } else if (eq(ci.loginType, '1')) {
      await orderModel.rawUpdate(
        db,
        'tbl_temp_delivery_address',
        { instruction: ci.input.post('instruction') },
        sql`user_id =${str(userId)} AND id=${str(addressId)} AND address_type='Ship'`,
      );
      shipData = first(await orderModel.getMemberAddressBookGuest(db, userId, 'Ship', addressId));
    } else {
      await orderModel.rawUpdate(
        db,
        'wl_customers_address_book',
        { instruction: ci.input.post('instruction') },
        sql`customer_id =${str(userId)} AND address_id=${str(addressId)} AND address_type='Ship'`,
      );
      shipData = first(await orderModel.getMemberAddressBook(db, userId, 'Ship', addressId));
    }
    data.email_id = await orderModel.fieldValue(db, 'wl_customers', 'user_name', { customers_id: userId });
    data.delivery_address = shipData;
    let cartTotal = cartTotalRes ? cartTotalRes.carttotal : null;
    data.cart_res = cartRes;
    data.cart_subtotal = cartTotal;
    data.shipping_amount = shippingAmount;
    data.discount_amount = discountAmount;
    cartTotal = num(cartTotal) + num(shippingAmount);
    if (couponRes) {
      data.coupon_type = couponRes.coupon_type;
      data.discount_amount = couponRes.discount_amount;
      cartTotal -= num(couponRes.discount_amount);
      data.coupon_title = 'Discount Amount';
    }
    const taxCent = 0;
    data.tax_cent = taxCent;
    const tax = (cartTotal * taxCent) / 100;
    data.total_tax_cent = tax;
    data.final_cart_amount = cartTotal + tax;
  }
  await defaultCurrency(db, data);
  ci.out.json(data);
}

/* ------------------------------------------------------------- order placement */

/**
 * Bytes stored in wl_orders_products.product_image: get_image("products", img, 60, 60) creates the cached
 * thumbnail, then file_get_contents() of thumb_cache/thumb_60_60_<img>, or of FCROOT/assets/developers/images/noimg1.gif
 * when there is no thumbnail. FCROOT defaults to the project root (set FCROOT where that asset lives).
 */
async function productImageBytes(ci, img) {
  await getImage(ci, 'products', img, 60, 60);
  const thumb = path.join(env.uploadDir, 'thumb_cache', `thumb_60_60_${str(img)}`);
  if (fs.existsSync(thumb) && fs.statSync(thumb).isFile()) return fs.readFileSync(thumb);
  const fcroot = process.env.FCROOT || path.join(__dirname, '..');
  const noImg = path.join(fcroot, 'assets', 'developers', 'images', 'noimg1.gif');
  return fs.existsSync(noImg) ? fs.readFileSync(noImg) : Buffer.alloc(0);
}

/** Cart::add_customer_order($customer_data) — private; returns the new order id ('' when the cart is empty). */
async function addCustomerOrder(ci, customerData) {
  const { db } = ci;
  let userId = ci.userId;
  const appId = ci.appId;
  let couponId = '';
  let discountAmount = '';
  let orderId = '';

  const byApp = !truthy(userId);
  const cartRes = await orderModel.cartRowsPlain(db, { userId, appId, byApp });
  const shipRes = await orderModel.tempRow(db, 'shipping', byApp ? 'app' : 'or', userId, appId);
  if (cartRes.length === 0) return orderId;

  const invoiceNumber = await orderModel.getAutoIncrement(db, 'wl_order');
  const couponRes = await orderModel.tempRow(db, 'coupon', byApp ? 'app' : 'or', userId, appId);
  if (couponRes) {
    couponId = couponRes.coupon_id;
    await orderModel.fieldValue(db, 'wl_coupons', 'coupon_code', { coupon_id: couponRes.coupon_id });
    discountAmount = couponRes.discount_amount;
  }
  const currencyCode = await orderModel.fieldValue(db, 'wl_currencies', 'code', { is_default: 'Y' });
  const currencyValue = await orderModel.fieldValue(db, 'wl_currencies', 'value', { is_default: 'Y' });
  const currencySymbolLeft = await orderModel.fieldValue(db, 'wl_currencies', 'symbol_left', { is_default: 'Y' });
  await orderModel.fieldValue(db, 'wl_currencies', 'symbol_right', { is_default: 'Y' });
  userId = neq(userId, '') ? userId : 0;

  const cartSum = truthy(userId)
    ? await orderModel.cartTotal(db, { userId, alias: 'total_price', expr: 'price*qty' })
    : await orderModel.cartTotal(db, { appId, byApp: true, alias: 'total_price', expr: 'price*qty' });
  const cartTotal = cartSum ? cartSum.total_price : null;

  let shippingAmount = '';
  let shippingType = '';
  if (shipRes) {
    shippingAmount = keyOr(shipRes, 'shipment_rate', '0');
    shippingType = keyOr(shipRes, 'shipping_type', '');
  }
  const taxCent = 0;
  const tax = (num(cartTotal) * taxCent) / 100;
  const totalAmount = numberFormat(num(numberFormat(num(cartTotal) + tax, 2, '.', '')), 2, '.', '');
  const customerType = num(userId) > 0 ? 'Member' : 'Guest';
  const customerTypes = intval(ci.input.getPost('customer_type'));
  const memberId = customerTypes > 0 ? ci.input.getPost('member_id') : userId;

  const cd = customerData;
  const dataOrder = {
    customers_id: memberId,
    customer_type: customerType,
    invoice_number: invoiceNumber,
    first_name: cd.first_name,
    last_name: cd.last_name,
    email: cd.email,
    mobile_number: cd.mobile,
    billing_name: cd.shipping_name,
    billing_address: cd.shipping_address,
    billing_phone: cd.shipping_phone,
    billing_mobile: cd.shipping_mobile,
    billing_zipcode: cd.shipping_pin_code,
    billing_country: cd.shipping_country,
    billing_state: cd.shipping_state,
    billing_city: cd.shipping_city,
    shipping_name: cd.shipping_name,
    shipping_address: cd.shipping_address,
    shipping_phone: cd.shipping_phone,
    shipping_mobile: cd.shipping_mobile,
    shipping_zipcode: cd.shipping_pin_code,
    shipping_country: cd.shipping_country,
    shipping_state: cd.shipping_state,
    shipping_city: cd.shipping_city,
    shipping_landmark: cd.shipping_landmark,
    shipping_method: shippingType,
    discount_coupon_id: couponId,
    coupon_discount_amount: discountAmount,
    shipping_amount: shippingAmount,
    total_amount: totalAmount,
    vat_amount: tax,
    vat_applied_cent: taxCent,
    currency_code: currencyCode,
    currency_value: currencyValue,
    currency_symbol: currencySymbolLeft,
    order_status: 'Pending',
    order_received_date: ci.config('config.date.time'),
    payment_method: cd.payment_method,
    app_id: appId,
    app_type: ci.appType,
    instruction: cd.instruction,
    added_by: userId,
    member_type: customerTypes,
    payment_status: 'Unpaid',
  };
  orderId = await orderModel.rawInsert(db, 'wl_order', dataOrder);

  for (const item of cartRes) {
    await orderModel.rawInsert(db, 'wl_orders_products', {
      orders_id: orderId,
      products_id: item.pid,
      product_name: item.origname,
      product_brand: item.brand_name,
      product_color: item.color_name,
      product_size: item.size_name,
      product_color_id: item.color_id,
      product_size_id: item.size_id,
      product_color_code: item.color_code,
      product_code: item.code,
      product_image: await productImageBytes(ci, item.img),
      img2: item.img2,
      product_price: item.price,
      app_id: appId,
      app_type: ci.appType,
      quantity: item.qty,
    });
  }

  const customersId = memberId;
  const couponData = await orderModel.getDbSingleRow(db, 'wl_coupons', '*', { coupon_id: couponId }, ci.out);
  if (couponData && eq(couponData.coupon_for, '1')) {
    const where = sql`coupon_id = ${str(couponId)} AND customer_id =${str(customersId)} AND status ='0' `;
    if (neq(couponId, '') && neq(customersId, '') && eq(couponData.coupon_usage, 'single')) {
      await orderModel.rawUpdate(db, 'wl_coupon_customers', { status: '1', used_count: '1' }, where);
    } else if (neq(couponId, '') && neq(customersId, '') && eq(couponData.coupon_usage, 'multiple')) {
      const used = await orderModel.getDbSingleRow(db, 'wl_coupon_customers', 'used_count', { coupon_id: couponId, customer_id: customersId, status: '0' }, ci.out);
      const usedCount = used ? used.used_count : null;
      const status = num(usedCount) < num(couponData.usage_count) - 1 ? '0' : '1';
      await orderModel.rawUpdate(db, 'wl_coupon_customers', { status, used_count: num(usedCount) + 1 }, where);
    }
  }

  // "Update member details if address blank" — the update itself is commented out in PHP; only the read ran.
  await orderModel.fieldValue(db, 'wl_customers_address_book', 'address', { customer_id: userId });

  if (eq(cd.payment_method, 'cod')) {
    const order = await orderModel.getOrderMaster(db, orderId);
    const details = await orderModel.getOrderDetail(db, orderId);
    const msg = await orderInvoiceContent(ci, order, details);
    const admin = (await ci.adminInfo()) || {};
    const siteName = ci.config('site_name');
    mailNotify({
      subject: `${str(admin.company_name)} Order Details`,
      to_email: order ? order.email : null,
      from_email: admin.admin_email,
      from_name: siteName,
      body_part: msg,
    });
    mailNotify({
      subject: `${str(admin.company_name)} Order Details`,
      to_email: admin.admin_email,
      from_email: admin.admin_email,
      from_name: siteName,
      body_part: msg,
    });
    const orderList = await orderModel.orderProducts(db, orderId);
    for (const val of orderList) await orderModel.decrementStock(db, val);
  }

  await orderModel.clearTempCart(db, userId, appId);
  return orderId;
}

/** POST /api/cart/payment — action=payment, payment_method, address_id, customer_type, member_id */
async function payment(req) {
  const { ci } = req;
  const { db } = ci;
  const appId = ci.appId;
  const userId = ci.userId;
  const customerType = intval(ci.input.getPost('customer_type'));
  let data = {};

  if (ci.input.server('REQUEST_METHOD') === 'POST') {
    if (eq(ci.input.post('action'), 'payment')) {
      ci.fv.setRules('payment_method', 'Payment Method', 'trim|required');
      ci.fv.setRules('address_id', 'Address Id', 'trim|required');
      if (customerType > 0) ci.fv.setRules('member_id', 'Member Id', 'trim|required');

      if ((await ci.fv.run()) === true) {
        const byApp = !truthy(userId);
        const cartRes = await orderModel.cartRows(db, { userId, appId, byApp, alias: 'carttotal' });
        if (cartRes.length > 0) {
          const mode = byApp ? 'app' : 'or';
          await orderModel.tempRow(db, 'coupon', mode, userId, appId);
          await orderModel.tempRow(db, 'shipping', mode, userId, appId);
          await orderModel.cartTotal(db, { userId, appId, byApp });
          const addressId = ci.input.post('address_id');

          let memberId;
          let mresShip;
          if (customerType > 0) {
            memberId = ci.input.getPost('member_id');
            mresShip = first(await orderModel.getMemberAddressBookSalesman(db, memberId, 'Ship', addressId, '', userId));
          } else {
            memberId = userId;
            mresShip = eq(ci.loginType, '1')
              ? first(await orderModel.getMemberAddressBookGuest(db, userId, 'Ship', addressId))
              : first(await orderModel.getMemberAddressBook(db, userId, 'Ship', addressId));
          }
          // (the cart summary computed here was discarded by PHP: $data is reset below)
          const mres = await orderModel.getMemberRow(db, memberId);
          const ms = mresShip || {};
          const mr = mres || {};
          const pick = (v) => (v === undefined ? null : v);
          const customerData = {
            shipping_address_type: pick(ms.address_type),
            first_name: neq(pick(ms.first_name), '') ? ms.first_name : pick(mr.first_name),
            last_name: neq(pick(ms.last_name), '') ? ms.last_name : pick(mr.last_name),
            email: pick(mr.user_name),
            mobile: neq(pick(ms.mobile), '') ? ms.mobile : pick(mr.mobile_number),
            shipping_name: `${str(ms.first_name)} ${str(ms.last_name)}`,
            shipping_address: pick(ms.address),
            shipping_phone: pick(ms.phone),
            shipping_mobile: pick(ms.mobile),
            shipping_city: pick(ms.city),
            shipping_state: pick(ms.state),
            shipping_pin_code: pick(ms.zipcode),
            shipping_landmark: pick(ms.landmark),
            shipping_country: pick(ms.country),
            instruction: pick(ms.instruction),
            currency_code: 'AED',
            currency_symbol: 'AED',
            app_id: appId,
            app_type: ci.appType,
            payment_method: ci.input.post('payment_method'),
          };
          const orderId = await addCustomerOrder(ci, customerData);
          let isCod = null;
          if (truthy(orderId)) {
            const ordData = await orderModel.getDbSingleRow(
              db,
              'wl_order',
              'total_amount,vat_amount,shipping_amount,coupon_discount_amount,payment_method',
              { order_id: orderId },
              ci.out,
            );
            isCod = ordData && eq(ordData.payment_method, 'cod') ? '1' : '0';
          }
          data = {};
          data.message = `Your Order has been placed successfully. A confirmation email and invoice has been sent to your email id (${str(mr.user_name)})`;
          data.is_cod = isCod;
          data.payment_link = `${ci.baseUrl()}api/payment?user_id=${str(userId)}&order_id=${str(orderId)}&app_id=&payment_method=knet`;
          data.order_id = orderId;
          data.success = 'true';
          await defaultCurrency(db, data);
        } else {
          data.success = 'false';
          data.error = 'Your shopping cart is empty';
        }
      } else {
        data = { success: 'false', error: firstErrorText(ci) };
      }
    } else {
      data.success = 'false';
      data.error = 'Parameter missing.';
    }
  } else {
    data.success = 'false';
    data.error = 'Request method does not allow';
  }
  ci.out.json(data);
}

/* -------------------------------------------------------------------- invoices */

/** Backtrace frames CodeIgniter printed for a warning raised directly in a Cart method. */
const cartFrames = (line) => [null, null, { file: 'modules/api/controllers/Cart.php', line, fn: '_error_handler' }, null, null, { file: 'index.php', line: 304, fn: 'require_once' }];

/** PHP 5.6 "Missing argument 1 for Cart::x()" warning when the URL carries no extra segment. */
function missingArgument(ci, fn, line) {
  ci.out.missingArguments(`Cart::${fn}`, 1, CART_FILE, line);
}

/** /api/cart/invoice_mail_data[/<ordId>] — CodeIgniter passes the 4th URI segment as $ordId. */
async function invoiceMailData(req) {
  const { ci } = req;
  const ordId = ci.segment(4);
  if (ordId === null) {
    missingArgument(ci, 'invoice_mail_data', 3038);
    return; // if (null != "") is false
  }
  // invoice_data() is not defined anywhere in the PHP project.
  ci.out.fatalError('Call to undefined function invoice_data()', 'modules/api/controllers/Cart.php', 3042);
}

/** GET|POST /api/cart/invoice — order_id */
async function invoice(req) {
  const { ci } = req;
  const { db } = ci;
  const data = {};
  const orderIdParam = ci.input.getPost('order_id');
  if (toBool(orderIdParam)) {
    let ordmaster = await orderModel.getOrderMaster(db, orderIdParam);
    const details = await orderModel.getOrderDetail(db, orderIdParam);
    if (ordmaster === null) ordmaster = {};
    ordmaster.is_email = neq(ordmaster.email === undefined ? null : ordmaster.email, '') ? '1' : '0';
    data.ordmaster = ordmaster;
    data.success = 'true';
    let amount = num(ordmaster.total_amount) - num(ordmaster.coupon_discount_amount);
    amount = amount + num(ordmaster.shipping_amount) + num(ordmaster.vat_amount);
    data.success = 'true';
    data.grand_total = numberFormat(amount, 2, '.', '');

    let resa = null;
    if (details === null) {
      ci.out.phpWarning('Invalid argument supplied for foreach()', CART_FILE, 3074, { frames: cartFrames(3074) });
    } else {
      resa = [];
      for (const row of details) {
        const val = { ...row };
        if (val.product_image !== null && val.product_image !== undefined) {
          const media = await orderModel.productDefaultMedia(db, val.products_id);
          if (media.length > 0) {
            val.product_image = '';
            const m = media[0].media;
            val.media = neq(m, '') && fs.existsSync(path.join(env.uploadDir, 'products', str(m))) ? m : '';
          } else {
            val.product_image = '';
            val.media = '';
          }
        }
        resa.push(val);
      }
    }
    const adminRes = await orderModel.adminLangRow(ci, ordmaster.language_id);
    if (adminRes) data.admin_res = adminRes;
    data.orddetail = resa;
  } else {
    data.success = 'false';
    data.error = 'parameter missing';
  }
  ci.out.json(data);
}

/** /api/cart/print_invoice — order id from $this->uri->segment(3) */
async function printInvoice(req) {
  const { ci } = req;
  const { db } = ci;
  const orderId = ci.segment(3);
  const data = { success: 'true' };
  const ordmaster = await orderModel.getOrderMaster(db, orderId);
  const details = await orderModel.getOrderDetail(db, orderId);
  data.ordmaster = ordmaster;
  data.orddetail = details;
  const adminRes = await orderModel.adminLangRow(ci, ordmaster ? ordmaster.language_id : null);
  if (adminRes) data.admin_res = adminRes;
  ci.out.json(data);
}

/** GET|POST /api/cart/site_currency */
async function siteCurrency(req) {
  const { ci } = req;
  const data = { currency_code: await orderModel.fieldValue(ci.db, 'wl_currencies', 'code', { currency_id: '1' }) };
  ci.out.json(data);
}

/** /api/cart/display_cart_image[/<orders_products_id>] — raw image bytes from wl_orders_products. */
async function displayCartImage(req, res) {
  const { ci } = req;
  const id = ci.segment(4);
  if (id === null) missingArgument(ci, 'display_cart_image', 3153);
  // ob_clean() discards everything printed so far (including the warning), then the binary is echoed.
  const binary = await orderModel.productImageBytes(ci.db, id);
  sendBinary(ci, res, binary, 'image/jpeg');
}

/** Sends raw bytes with the headers Output.send() uses (the shared output buffer is text-only). */
function sendBinary(ci, res, buf, contentType) {
  res.statusCode = 200;
  res.setHeader('Expires', 'Thu, 19 Nov 1981 08:52:00 GMT');
  res.setHeader('Cache-Control', 'post-check=0, pre-check=0');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, DELETE');
  res.setHeader('Access-Control-Allow-Headers', 'authorization');
  res.setHeader('Content-Type', contentType);
  res.setHeader('Content-Length', buf.length);
  res.end(buf);
}

/** /api/cart/show_top_cart — the view file does not exist. */
async function showTopCart(req) {
  req.ci.out.showError('Unable to load the requested file: show_top_html.php');
}

module.exports = {
  addDeliveryinfo,
  deliveryinfo,
  proccedPaymentForm,
  payment,
  invoiceMailData,
  invoice,
  printInvoice,
  siteCurrency,
  displayCartImage,
  showTopCart,
};
