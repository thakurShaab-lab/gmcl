/**
 * /api/cart/* — modules/api/controllers/Cart.php
 * The controller is split in two files: basket/shipping/coupons/addresses and delivery/checkout/invoices.
 */
const express = require('express');
const { ciRoute } = require('./ciRoute');
const { registerInheritedRoutes } = require('../controller/myController.controller');
const apiAuth = require('../middleware/apiAuth');
const registerBasketRoutes = require('./cart.basket.routes');
const registerCheckoutRoutes = require('./cart.checkout.routes');

const router = express.Router();

router.use(apiAuth);
registerBasketRoutes(router);
registerCheckoutRoutes(router);

registerInheritedRoutes(router, ciRoute); // MY_Controller's public methods

module.exports = router;
