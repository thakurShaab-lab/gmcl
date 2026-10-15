/**
 * /api/cart/* (first half of modules/api/controllers/Cart.php: basket, wishlist, shipping, coupons, addresses).
 * Registered by routes/cart.routes.js, which applies apiAuth.
 * Not ported (HTML test form): checkshipping_apply.
 */
const { ciRoute } = require('./ciRoute');
const cart = require('../controller/cart.controller');

module.exports = (router) => {
  ciRoute(router, ['', 'index'], cart.index);
  ciRoute(router, 'shopping_count', cart.shoppingCount);
  ciRoute(router, 'check_area', cart.checkArea);
  ciRoute(router, 'get_time_by_delivery_date', cart.getTimeByDeliveryDate);
  ciRoute(router, 'get_delivery_date', cart.getDeliveryDate);
  ciRoute(router, 'remove_cart', cart.removeCart);
  ciRoute(router, 'update_quantity', cart.updateQuantity);
  ciRoute(router, 'update_cart_qty', cart.updateCartQty);
  ciRoute(router, ['add_to_cart', 'add_cart'], cart.addCart);
  ciRoute(router, 'empty_cart', cart.emptyCart);
  ciRoute(router, 'check_product_exits_into_cart', cart.checkProductExitsIntoCart);
  ciRoute(router, 'add_to_wishlist', cart.addToWishlist);
  ciRoute(router, 'set_delivery', cart.setDelivery);
  ciRoute(router, 'shipping_apply', cart.shippingApply);
  ciRoute(router, 'shipping', cart.shipping);
  ciRoute(router, 'cart_shipping', cart.cartShipping);
  ciRoute(router, 'coupon_apply', cart.couponApply);
  ciRoute(router, 'apply_coupon_code', cart.applyCouponCode);
  ciRoute(router, 'is_valid_coupon', cart.isValidCoupon);
  ciRoute(router, 'valid_mobile', cart.validMobile);
  ciRoute(router, 'set_default_address', cart.setDefaultAddress);
  ciRoute(router, 'delete_address', cart.deleteAddress);
  ciRoute(router, 'addresses', cart.addresses);
  ciRoute(router, 'add_address', cart.addAddress);
  ciRoute(router, 'edit_address', cart.editAddress);
};
