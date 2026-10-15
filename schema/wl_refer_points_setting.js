// Table `wl_refer_points_setting` (InnoDB) — generated from gmcl.sql; column names match the database exactly.
const { int, mysqlTable } = require('drizzle-orm/mysql-core');

const wlReferPointsSetting = mysqlTable('wl_refer_points_setting', {
  id: int('id').notNull().autoincrement().primaryKey(),
  pointPerReferral: int('point_per_referral').default(0),
  // Set 1 point = 1 INR
  setPoints: int('set_points').notNull().default(0),
  minPurchaseAmount: int('min_purchase_amount').notNull().default(0),
  minRedeemValue: int('min_redeem_value').notNull().default(0),
  pointsGain: int('points_gain').default(0),
  // %
  point: int('point').notNull(),
});

module.exports = { wlReferPointsSetting };
