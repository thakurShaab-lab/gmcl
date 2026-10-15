/** /api/user/* — modules/api/controllers/User.php */
const express = require('express');
const { registerInheritedRoutes } = require('../controller/myController.controller');
const apiAuth = require('../middleware/apiAuth');
const { ciMiddleware } = require('../middleware/handle');
const { ciRoute } = require('./ciRoute');
const user = require('../controller/user.controller');

const router = express.Router();

router.use(apiAuth);
// User::__construct(): error delimiters + POST-only guard for some methods (keyed on the raw URI segment).
router.use(ciMiddleware(user.construct));

ciRoute(router, ['', 'index'], user.index);
ciRoute(router, 'face_authotication', user.faceAuthotication);
ciRoute(router, 'login', user.login);
ciRoute(router, 'forgotten_password', user.forgottenPassword);
ciRoute(router, 'valid_mobile', user.validMobile);
ciRoute(router, 'checkreferral', user.checkreferral);
ciRoute(router, 'register', user.register);
ciRoute(router, 'otp', user.otp);
ciRoute(router, 'check_verify_code', user.checkVerifyCode);
ciRoute(router, 'resend', user.resend);
ciRoute(router, 'logout', user.logout);
ciRoute(router, 'email_check', user.emailCheck);
ciRoute(router, 'mobile_check', user.mobileCheck);
ciRoute(router, 'valid_captcha_code', user.validCaptchaCode);
ciRoute(router, 'verify', user.verify);
ciRoute(router, 'country', user.country);
ciRoute(router, 'state', user.state);
ciRoute(router, 'city', user.city);
ciRoute(router, 'guest_login', user.guestLogin);
ciRoute(router, 'guest_otp', user.guestOtp);
ciRoute(router, 'transporter_login', user.transporterLogin);
ciRoute(router, 'transporter_forgotten_password', user.transporterForgottenPassword);
ciRoute(router, 'test_sendsms', user.testSendsms);

registerInheritedRoutes(router, ciRoute); // MY_Controller's public methods

module.exports = router;
