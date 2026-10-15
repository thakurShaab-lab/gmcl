// Table `wl_newsletter_log` (MyISAM) — generated from gmcl.sql; column names match the database exactly.
const { int, longtext, mysqlTable, timestamp } = require('drizzle-orm/mysql-core');

const wlNewsletterLog = mysqlTable('wl_newsletter_log', {
  id: int('id').notNull().autoincrement().primaryKey(),
  newsletterData: longtext('newsletter_data').notNull(),
  postedDate: timestamp('posted_date', { mode: 'string' }),
});

module.exports = { wlNewsletterLog };
