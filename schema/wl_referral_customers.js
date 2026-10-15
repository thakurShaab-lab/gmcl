// Table `wl_referral_customers` (InnoDB) — generated from gmcl.sql + migrations/001_add_missing_schema.sql; column names match the database exactly.
const { datetime, index, int, mysqlEnum, mysqlTable, varchar } = require('drizzle-orm/mysql-core');

const wlReferralCustomers = mysqlTable('wl_referral_customers', {
  referId: int('refer_id').notNull().autoincrement().primaryKey(),
  // referring customer email
  postedUser: varchar('posted_user', { length: 80 }),
  postedName: varchar('posted_name', { length: 100 }),
  // referred friend email
  referUser: varchar('refer_user', { length: 80 }),
  referName: varchar('refer_name', { length: 100 }),
  referMobile: varchar('refer_mobile', { length: 32 }),
  posterId: int('poster_id').notNull().default(0),
  referralCode: varchar('referral_code', { length: 20 }),
  isApproved: mysqlEnum('is_approved', ['0', '1']).notNull().default('0'),
  referDate: datetime('refer_date', { mode: 'string' }),
}, (t) => [
  index('idx_refer_user').on(t.referUser),
  index('idx_poster_id').on(t.posterId),
]);

module.exports = { wlReferralCustomers };
