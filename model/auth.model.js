const { and, eq, isNull } = require('drizzle-orm');
const { wlAplTokens, wlCustomers } = require('../schema');
const { fetchRow, alias } = require('./common.model');

/**
 * Api_Controller token lookup. CodeIgniter's where('token', NULL) compiles to "token IS NULL",
 * so a request without an Authorization header looks for a NULL token.
 */
function findActiveToken(db, token) {
  return fetchRow(
    db,
    db
      .select({
        user_id: wlAplTokens.userId,
        login_type: wlAplTokens.loginType,
        app_id: wlAplTokens.appId,
        app_type: wlAplTokens.appType,
        provider: wlAplTokens.provider,
      })
      .from(wlAplTokens)
      .where(and(token === null ? isNull(wlAplTokens.token) : eq(wlAplTokens.token, token), isNull(wlAplTokens.expiredAt))),
  );
}

/** The authenticated customer as exposed on $this->user. */
function findApiUser(db, userId) {
  return fetchRow(
    db,
    db
      .select({
        user_id: alias(wlCustomers.customersId, 'user_id'),
        user_name: wlCustomers.userName,
        first_name: wlCustomers.firstName,
        last_name: wlCustomers.lastName,
        name: alias(wlCustomers.firstName, 'name'),
        customer_photo: wlCustomers.customerPhoto,
        mobile_number: wlCustomers.mobileNumber,
      })
      .from(wlCustomers)
      .where(eq(wlCustomers.customersId, userId)),
  );
}

module.exports = { findActiveToken, findApiUser };
