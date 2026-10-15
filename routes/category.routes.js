/** /api/category/* — modules/api/controllers/Category.php */
const express = require('express');
const { registerInheritedRoutes } = require('../controller/myController.controller');
const apiAuth = require('../middleware/apiAuth');
const { ciRoute } = require('./ciRoute');
const category = require('../controller/category.controller');

const router = express.Router();

router.use(apiAuth);
ciRoute(router, ['', 'index'], category.index);
ciRoute(router, 'category_listing', category.categoryListing);
ciRoute(router, 'sub_category', category.subCategory);

registerInheritedRoutes(router, ciRoute); // MY_Controller's public methods

module.exports = router;
