// Table `wl_review` (MyISAM) — generated from gmcl.sql; column names match the database exactly.
const { datetime, int, mysqlEnum, mysqlTable, text, varchar } = require('drizzle-orm/mysql-core');

const wlReview = mysqlTable('wl_review', {
  reviewId: int('review_id').notNull().autoincrement().primaryKey(),
  // P=Product, B=Blog
  revType: mysqlEnum('rev_type', ['P', 'B']).notNull().default('P'),
  posterName: varchar('poster_name', { length: 30 }),
  email: varchar('email', { length: 80 }),
  rate: int('rate').notNull().default(0),
  comment: text('comment'),
  // Prod_id/Business_id
  entityId: int('entity_id').notNull().default(0),
  memberId: int('member_id').default(0),
  postedDate: datetime('posted_date', { mode: 'string' }),
  // 1=Actice,0=Inactive
  status: mysqlEnum('status', ['1', '0']).notNull().default('0'),
});

module.exports = { wlReview };
