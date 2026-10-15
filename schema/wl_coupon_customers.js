// Table `wl_coupon_customers` (MyISAM) — generated from gmcl.sql; column names match the database exactly.
const { datetime, int, mysqlEnum, mysqlTable, text, varchar } = require('drizzle-orm/mysql-core');

const wlCouponCustomers = mysqlTable('wl_coupon_customers', {
  id: int('id').notNull().autoincrement().primaryKey(),
  customerId: int('customer_id').notNull(),
  name: varchar('name', { length: 150 }),
  email: varchar('email', { length: 80 }),
  description: text('description'),
  couponId: int('coupon_id').notNull(),
  usedCount: int('used_count').notNull().default(0),
  // 1=used , 0=unused,2=multiple use
  status: mysqlEnum('status', ['0', '1', '2']).notNull().default('0'),
  receiveOn: datetime('receive_on', { mode: 'string' }).notNull(),
});

module.exports = { wlCouponCustomers };
