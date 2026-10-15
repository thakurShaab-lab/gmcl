// Table `tbl_temp_shipping` (InnoDB) — generated from gmcl.sql; column names match the database exactly.
const { decimal, int, mysqlTable, varchar } = require('drizzle-orm/mysql-core');

const tblTempShipping = mysqlTable('tbl_temp_shipping', {
  shipId: int('ship_id').notNull().autoincrement().primaryKey(),
  shippingId: int('shipping_id'),
  shipmentRate: decimal('shipment_rate', { precision: 10, scale: 2 }),
  shippingType: varchar('shipping_type', { length: 100 }),
  appId: varchar('app_id', { length: 255 }),
  appType: varchar('app_type', { length: 10 }),
  languageId: int('language_id'),
  userId: int('user_id'),
});

module.exports = { tblTempShipping };
