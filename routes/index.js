/**
 * /api/* routes — modules/api/controllers/*.php (CodeIgniter HMVC module "api").
 * Excluded by design: SitePanel (/sitepanel/*), website pages (HTML) and the API documentation pages
 * (/api/parameter, /api/parameters render HTML views).
 */
const express = require('express');
const ciContext = require('../middleware/ciContext');
const apiAuth = require('../middleware/apiAuth');
const { handle } = require('../middleware/handle');
const errors = require('../controller/error.controller');

const router = express.Router();

const API_CONTROLLERS = {
  cart: require('./cart.routes'),
  category: require('./category.routes'),
  member: require('./member.routes'),
  pages: require('./pages.routes'),
  payment: require('./payment.routes'),
  products: require('./products.routes'),
  transporter: require('./transporter.routes'),
  user: require('./user.routes'),
};

router.use('/api', ciContext);

for (const [name, controllerRouter] of Object.entries(API_CONTROLLERS)) {
  router.use(`/api/${name}`, controllerRouter);
  // Unknown method on an existing controller -> api/pages/error_404 (Api_Controller auth, empty body).
  router.all([`/api/${name}`, `/api/${name}/*`], apiAuth, handle(errors.apiMethodNotFound));
}

// HTML-only endpoints that are intentionally not part of this API service.
router.all(['/api/parameter', '/api/parameter/*', '/api/parameters', '/api/parameters/*'], (req, res) => {
  res.status(404).type('text/plain').send('Not Found');
});

// Unknown controller under /api -> the website's 404 view ("UnderConstruction").
router.all(['/api', '/api/*'], handle(errors.underConstruction));

module.exports = router;
