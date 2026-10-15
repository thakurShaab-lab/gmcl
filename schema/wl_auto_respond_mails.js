// Table `wl_auto_respond_mails` (InnoDB) — generated from gmcl.sql; column names match the database exactly.
const { datetime, int, mysqlEnum, mysqlTable, text, varchar } = require('drizzle-orm/mysql-core');

const wlAutoRespondMails = mysqlTable('wl_auto_respond_mails', {
  id: int('id').notNull().autoincrement().primaryKey(),
  emailSection: varchar('email_section', { length: 80 }).notNull(),
  emailSubject: varchar('email_subject', { length: 200 }).notNull(),
  emailContent: text('email_content').notNull(),
  status: mysqlEnum('status', ['0', '1', '2']).notNull().default('1'),
  updatedOn: datetime('updated_on', { mode: 'string' }),
});

module.exports = { wlAutoRespondMails };
