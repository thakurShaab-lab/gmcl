/**
 * Member and Transporter controller constructors: a logged-in customer (token auth) is required;
 * the static API key alone is rejected.
 */
const { ciMiddleware } = require('./handle');
const { empty } = require('../utils/php');

module.exports = ciMiddleware(async (ci) => {
  if (empty(ci.user)) {
    ci.out.json({ success: 'false', error: 'Credential not valid.' });
    ci.exit();
  }
});
