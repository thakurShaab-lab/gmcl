// Table `wl_shipping` (MyISAM) — generated from gmcl.sql; column names match the database exactly.
const { datetime, decimal, int, mysqlEnum, mysqlTable, varchar } = require('drizzle-orm/mysql-core');

const wlShipping = mysqlTable('wl_shipping', {
  shippingId: int('shipping_id').notNull().autoincrement().primaryKey(),
  isDefault: mysqlEnum('is_default', ['0', '1']).notNull().default('0'),
  shippingType: varchar('shipping_type', { length: 50 }).notNull(),
  shipmentRate: decimal('shipment_rate', { precision: 10, scale: 2 }).notNull().default('0.00'),
  // 1=active,2=inactive,3=deleted
  status: mysqlEnum('status', ['1', '0', '2']).notNull().default('1'),
  addedDate: datetime('added_date', { mode: 'string' }).notNull(),
});

module.exports = { wlShipping };
