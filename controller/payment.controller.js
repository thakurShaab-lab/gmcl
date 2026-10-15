/**
 * modules/api/controllers/Payment.php (extends Public_Controller: no API credential check, no CORS headers).
 *
 * The PHP constructor loads the helper 'payment/knet', which does not exist in the PHP project, so
 * CodeIgniter stops every request with show_error() and HTTP 500 before any method runs (the payment gateway
 * callback pages were unreachable). This controller reproduces that response for every public method.
 */
async function constructorFailure(req, res) {
  req.ci.cors = false;
  req.ci.out.showError('Unable to load the requested file: helpers/payment/knet_helper.php');
}

const METHODS = [
  // inherited from MY_Controller
  'fetch_spamwords', 'filter_spamwords', 'has_spamwords', 'check_spamwords',
  'index', 'order_success', 'check_order_cancle', 'order_cancle', 'order_response', 'order_result'];

module.exports = { constructorFailure, METHODS };
