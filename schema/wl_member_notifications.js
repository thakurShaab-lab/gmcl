// Table `wl_member_notifications` (InnoDB) — generated from gmcl.sql; column names match the database exactly.
const { date, int, mysqlEnum, mysqlTable, text, varchar } = require('drizzle-orm/mysql-core');

const wlMemberNotifications = mysqlTable('wl_member_notifications', {
  id: int('id').notNull().autoincrement().primaryKey(),
  postDate: date('post_date', { mode: 'string' }),
  memberId: int('member_id'),
  comment: text('comment'),
  status: mysqlEnum('status', ['0', '1', '2']).default('1'),
  name: varchar('name', { length: 250 }),
  email: varchar('email', { length: 250 }),
  // 0=normal,1=outlet,2=sales
  customerType: mysqlEnum('customer_type', ['0', '1', '2']).notNull().default('0'),
  // 0=No,1=Yes
  isRead: int('is_read').notNull().default(0),
  title: varchar('title', { length: 250 }),
  notificationId: int('notification_id').notNull().default(0),
});

module.exports = { wlMemberNotifications };
