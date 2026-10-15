/**
 * modules/api/controllers/Transporter.php
 *
 * The PHP constructor loads the model 'transporter/transporter_model', which does not exist anywhere in the
 * PHP project. CodeIgniter therefore stops every Transporter request (after the Api_Controller credential
 * check) with show_error() and HTTP 500, before the requested method runs. The method bodies were never
 * reachable, so this controller reproduces exactly that response for every public method.
 */
async function constructorFailure(req, res) {
  req.ci.out.showError('Unable to locate the model you have specified: Transporter_model');
}

// Public methods of Transporter.php — all routable, all answered by the failing constructor.
const METHODS = [
  // inherited from MY_Controller
  'fetch_spamwords', 'filter_spamwords', 'has_spamwords', 'check_spamwords',
  'member_topheader', 'index', 'edit_account', 'set_online_offline', 'set_current_location', 'mobile_check',
  'valid_mobile', 'valid_area', 'smepwd_check', 'oldpwd_check', 'change_password', 'accept_order', 'reject_order',
  'set_order_paid', 'delivered', 'new_orders', 'orders', 'print_invoice', 'invoice', 'admin_details',
  'device_registration', 'check_price_zero', 'notification', 'count_notification', 'refer_friend', 'member_coupons',
];

module.exports = { constructorFailure, METHODS };
