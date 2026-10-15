// Table `wl_newsletter_groups` (InnoDB) — generated from gmcl.sql; column names match the database exactly.
const { datetime, int, mysqlEnum, mysqlTable, varchar } = require('drizzle-orm/mysql-core');

const wlNewsletterGroups = mysqlTable('wl_newsletter_groups', {
  newsletterGroupsId: int('newsletter_groups_id').notNull().autoincrement().primaryKey(),
  groupName: varchar('group_name', { length: 40 }).notNull(),
  // 1=Actice,0=Inactive
  status: mysqlEnum('status', ['1', '0']).notNull().default('1'),
  groupsCreatedDate: datetime('groups_created_date', { mode: 'string' }).notNull(),
});

module.exports = { wlNewsletterGroups };
