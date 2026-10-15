const { eq } = require('drizzle-orm');
const { tblAdmin } = require('../schema');
const { fetchRow } = require('./common.model');
const { asObject } = require('../utils/php');

/** MY_Controller: $this->admin_info = tbl_admin row with admin_id = 1 (a PHP object), or undefined. */
async function getAdminInfo(db) {
  const row = await fetchRow(db, db.select().from(tblAdmin).where(eq(tblAdmin.adminId, '1')));
  return row ? asObject(row) : null;
}

module.exports = { getAdminInfo };
