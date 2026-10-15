/** /api/payment/* — modules/api/controllers/Payment.php (see controller for why every method fails). */
const express = require('express');
const { ciRoute } = require('./ciRoute');
const payment = require('../controller/payment.controller');

const router = express.Router();

ciRoute(router, ['', ...payment.METHODS], payment.constructorFailure);

module.exports = router;
