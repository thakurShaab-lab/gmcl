// Table `wl_supports` (InnoDB) — generated from gmcl.sql; column names match the database exactly.
const { date, int, mysqlEnum, mysqlTable, text, varchar } = require('drizzle-orm/mysql-core');

const wlSupports = mysqlTable('wl_supports', {
  id: int('id').notNull().autoincrement().primaryKey(),
  postDate: date('post_date', { mode: 'string' }),
  memberId: int('member_id'),
  comment: text('comment'),
  status: mysqlEnum('status', ['0', '1', '2']).default('1'),
  name: varchar('name', { length: 250 }),
  email: varchar('email', { length: 250 }),
  // 0=normal,1=outlet,2=sales
  customerType: mysqlEnum('customer_type', ['0', '1', '2']).notNull().default('0'),
  // N=No,Y=Yes
  replyStatus: mysqlEnum('reply_status', ['Y', 'N']).notNull().default('N'),
  reply: text('reply'),
  replyDate: date('reply_date', { mode: 'string' }),
});

module.exports = { wlSupports };
