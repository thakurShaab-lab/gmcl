/**
 * modules/cart/helpers/cart_helper.php order_invoice_content($ordmaster, $orddetail, $print): the order
 * mail body that Cart::add_customer_order captured with ob_start() for COD orders.
 */
const { getDbSingleRow } = require('../model/common.model');
const { displayPrice } = require('../model/helper.model');
const { getDateFormat } = require('./helpers');
const { str, num, toBool } = require('./php');

/** PHP `$x != ''` / truthiness checks used by the helper. */
const filled = (v) => toBool(v);

async function orderInvoiceContent(ci, ordmaster, orddetail) {
  const db = ci.db;
  const om = ordmaster || {};
  // display_symbol(): read for the session currency only; its value is not printed.
  const siteDetails = (await getDbSingleRow(db, 'tbl_admin', '*', ' and  admin_id =1', ci.out)) || {};

  let adminAddress = '';
  if (filled(siteDetails.address)) adminAddress += `${siteDetails.address}, `;
  if (filled(siteDetails.city)) adminAddress += `${siteDetails.city},<br> `;
  if (filled(siteDetails.state)) adminAddress += siteDetails.state;
  if (filled(siteDetails.zipcode)) adminAddress += `-${siteDetails.zipcode}`;
  if (filled(siteDetails.country)) adminAddress += `<br> <strong>${siteDetails.country}</strong>`;

  let shippingAddress = '';
  if (filled(om.shipping_address)) shippingAddress += `${om.shipping_address}, `;
  if (filled(om.shipping_city)) shippingAddress += `${om.shipping_city}, `;
  if (filled(om.shipping_state)) shippingAddress += om.shipping_state;
  if (filled(om.shipping_zipcode)) shippingAddress += ` - ${om.shipping_zipcode}`;
  if (filled(om.shipping_country)) shippingAddress += `, ${om.shipping_country}`;

  let subtotal = '';
  let subTotal = 0;
  let totalTax = 0;
  let orderProducts = '';
  const base = ci.baseUrl();
  if (Array.isArray(orddetail) && orddetail.length) {
    for (const val of orddetail) {
      subtotal = num(val.quantity) * num(val.product_price);
      const unitPrice = val.product_price;
      const tax = num(val.product_price) - num(unitPrice);
      subTotal += num(unitPrice) * num(val.quantity);
      totalTax += tax * num(val.quantity);
      orderProducts += `<div style="border:#eee 1px solid; padding:15px; margin-top:10px; box-shadow:#eee 1px 2px 4px; position:relative;">
<div style="float:left; margin-right:15px;"><span><img src="${base}cart/display_cart_image/${str(val.orders_products_id)}" width="100" alt="${str(val.product_name)}"></span></div>
<div style="font-size:1.1em; font-weight:600;">${str(val.product_name)}</div>`;
      if (str(val.product_brand) !== '') orderProducts += `<div style="margin-top:5px;">Brand :<span style="color:#111fa4;"> ${val.product_brand}</span></div>`;
      if (str(val.product_size) !== '') orderProducts += `<div style="margin-top:5px;">Size :<span style="color:#111fa4;"> ${val.product_size}</span></div>`;
      if (str(val.product_color) !== '') orderProducts += `<div style="margin-top:5px;">Color :<span style="color:#111fa4;"> ${val.product_color}</span></div>`;
      orderProducts += `<div style="margin-top:5px;">Qty: ${str(val.quantity)}</a></div>
<div style="color:#000; font-size:1.1em; margin-top:5px;"><b style="color:#cc0000;">${await displayPrice(db, unitPrice)}</b></div>
<div style="clear:both;"></div>
</div>`;
    }
  }
  const totalShipping = om.shipping_amount;
  const discountAmount = om.coupon_discount_amount;
  const tax = om.vat_amount;
  const grandTotal = subTotal - num(discountAmount) + num(totalShipping) + totalTax;
  const siteName = ci.config('site_name');

  let html = `

<div style="text-align:center; margin-bottom:20px;">
<div><img src="${base}assets/designer/themes/default/images/logo.png" width="150" alt="${str(siteName)}"></div>
<div style="margin-top:15px;">${adminAddress}</div>
<div style="margin-top:5px;"><span><strong>Ph No. :</strong> ${str(siteDetails.phone)}</span></div>
</div>

<p style="border-bottom:#ddd 1px solid;"></p>

<div style="margin:20px 0;">
<div style="color:#000; text-align:center; font-size:18px; font-weight:700; text-transform:uppercase;">Order Summary</div>
<div style="font-size:15px; margin-top:10px;">
<div style="float:left; width:32%; padding:5px;"><b>Invoice ID:</b> ${str(om.invoice_number)}</div>
<div style="float:left; width:32%; padding:5px;"><b>Payment Mode:</b> ${str(om.payment_method)}</div>
<div style="float:left; width:32%; padding:5px;"><b>Date:</b> ${str(getDateFormat(om.order_received_date, 1))}</div>
<div style="float:left; width:32%; padding:5px;"><b>Sub Total:</b> ${await displayPrice(db, subtotal)}</div>
`;
  if (num(totalShipping) > 0) {
    html += `<div style="float:left; width:32%; padding:5px;"><b>Shipping Charges : </b>${await displayPrice(db, totalShipping)}</div>
`;
  }
  if (num(tax) > 0) {
    html += `<div style="float:left; width:32%; padding:5px;"><b>Tax : </b>${await displayPrice(db, tax)}</div>
`;
  }
  if (num(discountAmount) > 0) {
    html += `<div style="float:left; width:32%; padding:5px;"><b>Coupon Discount : </b>${await displayPrice(db, discountAmount)}</div>
`;
  }
  html += `<div style="float:left; width:32%; padding:5px;">Total Payable Amount: <b>${await displayPrice(db, grandTotal)}</b></div>
<div style="clear:both;"></div>
</div>
</div>

<p style="border-bottom:#ddd 1px solid;"></p>

<div style="margin:25px 0; text-align:center;">
<div>
<div style="font-size:15px; font-weight:700;">${str(om.shipping_name)}</div>
<div style="margin-top:5px;"><b>Phone No.:</b> ${str(om.shipping_mobile)}</div>
<div style="margin-top:5px;"><b>Address</b>: ${shippingAddress}</div>
</div>
</div>
 ${orderProducts}



  <div style="text-align:center; margin-top:15px;"><a href="javascript:void();" onclick="javascript:window.print();" class="invoice" style="color:#f00; text-decoration:none;">Print Invoice</a></div>
	`;
  return html;
}

module.exports = { orderInvoiceContent };
