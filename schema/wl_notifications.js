// Table `wl_notifications` (InnoDB) — generated from gmcl.sql; column names match the database exactly.
const { datetime, int, longtext, mysqlEnum, mysqlTable, text, varchar } = require('drizzle-orm/mysql-core');

const wlNotifications = mysqlTable('wl_notifications', {
  id: int('id').notNull().autoincrement().primaryKey(),
  membersIds: text('members_ids'),
  postedOn: datetime('posted_on', { mode: 'string' }),
  title: varchar('title', { length: 250 }),
  descriptions: longtext('descriptions'),
  status: int('status'),
  notificationId: int('notification_id').notNull().default(0),
  readStatus: mysqlEnum('read_status', ['0', '1']).notNull().default('0'),
  customerId: int('customer_id').notNull().default(0),
});

module.exports = { wlNotifications };
