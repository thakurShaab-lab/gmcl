// Table `wl_coupons` (MyISAM) — generated from gmcl.sql; column names match the database exactly.
const { date, datetime, decimal, float, int, mysqlEnum, mysqlTable, varchar } = require('drizzle-orm/mysql-core');

const wlCoupons = mysqlTable('wl_coupons', {
  couponId: int('coupon_id').notNull().autoincrement().primaryKey(),
  couponTitle: varchar('coupon_title', { length: 200 }),
  couponCode: varchar('coupon_code', { length: 10 }),
  // p=percentage , f=free shipping , a=amount
  couponType: mysqlEnum('coupon_type', ['p', 'f', 'a']).notNull().default('p'),
  couponUsage: mysqlEnum('coupon_usage', ['multiple', 'single']).notNull().default('single'),
  usageCount: int('usage_count').notNull().default(1),
  // 0=for all, 1=for members
  couponFor: mysqlEnum('coupon_for', ['0', '1']).notNull().default('0'),
  couponDiscount: decimal('coupon_discount', { precision: 10, scale: 2 }).notNull().default('0.00'),
  maximumCouponDiscount: float('maximum_coupon_discount', { precision: 10, scale: 2 }).notNull().default(0),
  minimumOrderAmount: decimal('minimum_order_amount', { precision: 10, scale: 2 }).notNull().default('0.00'),
  startDate: date('start_date', { mode: 'string' }),
  endDate: date('end_date', { mode: 'string' }),
  // 0=Inactive,1=Active,2=Deleted
  status: mysqlEnum('status', ['0', '1', '2']).notNull().default('1'),
  dateAdded: datetime('date_added', { mode: 'string' }),
});

module.exports = { wlCoupons };
