// Table `wl_newsletter_group_subscriber` (InnoDB) — generated from gmcl.sql; column names match the database exactly.
const { datetime, int, mysqlTable } = require('drizzle-orm/mysql-core');

const wlNewsletterGroupSubscriber = mysqlTable('wl_newsletter_group_subscriber', {
  groupSubscriberId: int('group_subscriber_id').notNull().autoincrement().primaryKey(),
  newsletterGroupsId: int('newsletter_groups_id').notNull(),
  subscriberId: int('subscriber_id').notNull(),
  dateAdded: datetime('date_added', { mode: 'string' }).notNull(),
});

module.exports = { wlNewsletterGroupSubscriber };
