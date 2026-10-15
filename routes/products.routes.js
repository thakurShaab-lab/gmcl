/** /api/products/* — modules/api/controllers/Products.php */
const express = require('express');
const { registerInheritedRoutes } = require('../controller/myController.controller');
const apiAuth = require('../middleware/apiAuth');
const { ciRoute } = require('./ciRoute');
const products = require('../controller/products.controller');

const router = express.Router();

router.use(apiAuth);
ciRoute(router, ['', 'index'], products.index);
ciRoute(router, 'suggestion_search', products.suggestionSearch);
ciRoute(router, 'product_paging', products.productPaging);
ciRoute(router, 'get_size_price_old', products.getSizePriceOld);
ciRoute(router, 'detail', products.detail);
ciRoute(router, 'get_view_stock', products.getViewStock);
ciRoute(router, 'get_product_review', products.getProductReview);
ciRoute(router, 'product_review_post', products.productReviewPost);
ciRoute(router, 'product_enquiry', products.productEnquiry);
ciRoute(router, 'producer', products.producer);
ciRoute(router, 'producers', products.producers);
ciRoute(router, 'flyer', products.flyer);
ciRoute(router, 'search_attribute', products.searchAttribute);
ciRoute(router, 'color', products.color);
ciRoute(router, 'size', products.size);
ciRoute(router, 'brand', products.brand);
ciRoute(router, 'featured', products.featured);
ciRoute(router, 'price_range', products.priceRange);
ciRoute(router, 'get_size_price', products.getSizePrice);
ciRoute(router, 'home', products.home);
ciRoute(router, 'certificate_authority', products.certificateAuthority);

registerInheritedRoutes(router, ciRoute); // MY_Controller's public methods

module.exports = router;
