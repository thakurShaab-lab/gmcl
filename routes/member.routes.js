/** /api/member/* — modules/api/controllers/Member.php (logged-in customers only) */
const express = require('express');
const { registerInheritedRoutes } = require('../controller/myController.controller');
const apiAuth = require('../middleware/apiAuth');
const requireUser = require('../middleware/requireUser');
const { ciRoute } = require('./ciRoute');
const member = require('../controller/member.controller');

const router = express.Router();

router.use(apiAuth);
router.use(requireUser);

ciRoute(router, ['', 'index'], member.index);
ciRoute(router, 'member_topheader', member.memberTopheader);
ciRoute(router, 'edit_account', member.editAccount);
ciRoute(router, 'update_image', member.updateImage);
ciRoute(router, 'face_authotication', member.faceAuthotication);
ciRoute(router, 'addresses', member.addresses);
ciRoute(router, 'delete_address', member.deleteAddress);
ciRoute(router, 'add_address', member.addAddress);
ciRoute(router, 'edit_address', member.editAddress);
ciRoute(router, 'email_check', member.routeEmailCheck);
ciRoute(router, 'mobile_check', member.routeMobileCheck);
ciRoute(router, 'valid_mobile', member.routeValidMobile);
ciRoute(router, 'valid_area', member.routeValidArea);
ciRoute(router, 'smepwd_check', member.routeSmepwdCheck);
ciRoute(router, 'oldpwd_check', member.routeOldpwdCheck);
ciRoute(router, 'change_password', member.changePassword);
ciRoute(router, 'wishlist', member.wishlist);
ciRoute(router, 'delete_member_wishlist', member.deleteMemberWishlist);
ciRoute(router, 'reason_list', member.reasonList);
ciRoute(router, 'cancel_order', member.cancelOrder);
ciRoute(router, 'members_listing', member.membersListing);
ciRoute(router, 'member_support_old', member.memberSupportOld);
ciRoute(router, 'post_support_old', member.postSupportOld);
ciRoute(router, 'member_support', member.memberSupport);
ciRoute(router, 'post_support', member.postSupport);
ciRoute(router, 'count_notification', member.countNotification);
ciRoute(router, 'member_notification', member.memberNotification);
ciRoute(router, 'return_product', member.returnProduct);
ciRoute(router, 'return_order', member.returnOrder);
ciRoute(router, 'orders', member.orders);
ciRoute(router, 'print_invoice', member.printInvoice);
ciRoute(router, 'invoice', member.invoice);
ciRoute(router, 'product_feedback', member.productFeedback);
ciRoute(router, 'admin_details', member.adminDetails);
ciRoute(router, 'device_registration', member.deviceRegistration);
ciRoute(router, 'check_price_zero', member.routeCheckPriceZero);
ciRoute(router, 'notification', member.notification);
ciRoute(router, 'count_notificationssss', member.countNotificationssss);
ciRoute(router, 'refer_friend', member.referFriend);
ciRoute(router, 'member_coupons', member.memberCoupons);
ciRoute(router, 'rewards_point', member.rewardsPoint);
ciRoute(router, 'track_order', member.trackOrder);
ciRoute(router, 'delete_own_accounts', member.deleteOwnAccounts);
registerInheritedRoutes(router, ciRoute); // MY_Controller's public methods

module.exports = router;
