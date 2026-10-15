/**
 * Api_Controller constructor (apps/core/Api_Controller.php).
 *
 * The Authorization header must be either an active token from wl_apl_tokens (its customer must exist)
 * or the static API key. On success ci.user / ci.userId / ci.loginType / ci.appId / ci.appType / ci.token
 * are set (0 / "" defaults when the API key is used). Failures print a JSON error and exit with HTTP 200.
 */
const { API_KEY } = require('../config/app');
const { asObject } = require('../utils/php');
const authModel = require('../model/auth.model');
const { ciMiddleware } = require('./handle');

module.exports = ciMiddleware(async (ci) => {
  const authorization = ci.input.server('HTTP_AUTHORIZATION');
  ci.userId = 0;
  ci.loginType = 0;
  ci.appId = '';
  ci.appType = '';
  ci.user = undefined;
  ci.token = undefined;

  const tokenRow = await authModel.findActiveToken(ci.db, authorization);
  if (tokenRow) {
    const user = await authModel.findApiUser(ci.db, tokenRow.user_id);
    if (user) {
      ci.user = asObject(user);
      ci.token = authorization;
      ci.userId = tokenRow.user_id;
      ci.loginType = tokenRow.login_type;
      ci.appId = tokenRow.app_id;
      ci.appType = tokenRow.app_type;
    } else {
      ci.token = '';
      ci.out.json({ success: 'false', error: 'Credential not valid. Please login agian.' });
      ci.exit();
    }
  } else if (authorization !== API_KEY) {
    ci.token = '';
    ci.out.json({ success: 'false', error: 'Credential not valid.' });
    ci.exit();
  }
});
