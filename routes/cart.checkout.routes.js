/**
 * Checkout half of /api/cart/* (modules/api/controllers/Cart.php, add_deliveryinfo() .. show_top_cart()).
 * Registered by routes/cart.routes.js behind apiAuth.
 */
const { ciRoute } = require('./ciRoute');
const checkout = require('../controller/cartCheckout.controller');

module.exports = (router) => {
  ciRoute(router, 'add_deliveryinfo', checkout.addDeliveryinfo);
  ciRoute(router, 'deliveryinfo', checkout.deliveryinfo);
  ciRoute(router, 'procced_payment_form', checkout.proccedPaymentForm);
  ciRoute(router, 'payment', checkout.payment);
  ciRoute(router, 'invoice_mail_data', checkout.invoiceMailData);
  ciRoute(router, 'invoice', checkout.invoice);
  ciRoute(router, 'print_invoice', checkout.printInvoice);
  ciRoute(router, 'site_currency', checkout.siteCurrency);
  ciRoute(router, 'display_cart_image', checkout.displayCartImage);
  ciRoute(router, 'show_top_cart', checkout.showTopCart);
};
