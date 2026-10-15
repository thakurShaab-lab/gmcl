// Table `tbl_temp_discountcoupon` (InnoDB) — generated from gmcl.sql; column names match the database exactly.
const { float, int, mysqlTable, varchar } = require('drizzle-orm/mysql-core');

const tblTempDiscountcoupon = mysqlTable('tbl_temp_discountcoupon', {
  dcoupId: int('dcoup_id').notNull().autoincrement().primaryKey(),
  couponId: int('coupon_id'),
  discountAmount: float('discount_amount', { precision: 10, scale: 2 }),
  couponType: varchar('coupon_type', { length: 50 }),
  appId: varchar('app_id', { length: 255 }),
  appType: varchar('app_type', { length: 10 }),
  languageId: int('language_id'),
  userId: int('user_id'),
});

module.exports = { tblTempDiscountcoupon };
