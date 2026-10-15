// Table `wl_newsletters` (InnoDB) — generated from gmcl.sql; column names match the database exactly.
const { datetime, int, mysqlEnum, mysqlTable, varchar } = require('drizzle-orm/mysql-core');

const wlNewsletters = mysqlTable('wl_newsletters', {
  subscriberId: int('subscriber_id').notNull().autoincrement().primaryKey(),
  subscriberName: varchar('subscriber_name', { length: 32 }),
  subscriberEmail: varchar('subscriber_email', { length: 80 }),
  // 1=Active,0=Deactive,2=Deleted
  status: mysqlEnum('status', ['0', '1', '2']).default('1'),
  // 1=Yes,0=No
  mailStatus: mysqlEnum('mail_status', ['1', '0']).default('0'),
  subscribeDate: datetime('subscribe_date', { mode: 'string' }),
  mailSentDate: datetime('mail_sent_date', { mode: 'string' }),
});

module.exports = { wlNewsletters };
