/** /api/pages/* — modules/api/controllers/Pages.php */
const express = require('express');
const { registerInheritedRoutes } = require('../controller/myController.controller');
const apiAuth = require('../middleware/apiAuth');
const { ciRoute } = require('./ciRoute');
const pages = require('../controller/pages.controller');

const router = express.Router();

router.use(apiAuth);
ciRoute(router, ['', 'index'], pages.index);
ciRoute(router, 'error_404', pages.error404);
ciRoute(router, 'notification_test', pages.notificationTest);
ciRoute(router, 'refer_to_friends', pages.referToFriends);
ciRoute(router, 'faq', pages.faq);
ciRoute(router, 'news', pages.news);
ciRoute(router, 'testimonial', pages.testimonial);
ciRoute(router, 'testimonial_details', pages.testimonialDetails);
ciRoute(router, 'post_testimonial', pages.postTestimonial);
ciRoute(router, 'news_details', pages.newsDetails);
ciRoute(router, 'price_list', pages.priceList);
ciRoute(router, 'image_gallery', pages.imageGallery);
ciRoute(router, 'video_gallery', pages.videoGallery);
ciRoute(router, 'update_keys', pages.updateKeys);
ciRoute(router, 'banner_list', pages.bannerList);
ciRoute(router, 'search_list', pages.searchList);
ciRoute(router, 'services', pages.services);
ciRoute(router, 'services_details', pages.servicesDetails);
ciRoute(router, 'cms_pages', pages.cmsPages);
ciRoute(router, 'aboutus', pages.aboutus);
ciRoute(router, 'catalog', pages.catalog);
ciRoute(router, 'gallery', pages.gallery);
ciRoute(router, 'bone_china_design', pages.boneChinaDesign);
ciRoute(router, 'privacy_policy', pages.privacyPolicy);
ciRoute(router, 'terms_conditions', pages.termsConditions);
ciRoute(router, 'our_science', pages.ourScience);
ciRoute(router, 'our_people', pages.ourPeople);
ciRoute(router, 'return_policy', pages.returnPolicy);
ciRoute(router, 'how_to_buy', pages.howToBuy);
ciRoute(router, 'clear_cache', pages.clearCache);
ciRoute(router, 'valid_mobile', pages.validMobile);
ciRoute(router, 'post_newsletter', pages.postNewsletter);
ciRoute(router, 'admin_details', pages.adminDetails);
ciRoute(router, 'contactus', pages.contactus);
ciRoute(router, 'get_cities', pages.getCities);
ciRoute(router, 'get_locations', pages.getLocations);
ciRoute(router, 'get_slots', pages.getSlots);
ciRoute(router, 'reason', pages.reason);

registerInheritedRoutes(router, ciRoute); // MY_Controller's public methods

module.exports = router;
