/** /api/transporter/* — modules/api/controllers/Transporter.php (see controller for why every method fails). */
const express = require('express');
const apiAuth = require('../middleware/apiAuth');
const { ciRoute } = require('./ciRoute');
const transporter = require('../controller/transporter.controller');

const router = express.Router();

router.use(apiAuth);
ciRoute(router, ['', ...transporter.METHODS], transporter.constructorFailure);

module.exports = router;
