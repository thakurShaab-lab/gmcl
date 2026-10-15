// Table `wl_cms_pages` (InnoDB) — generated from gmcl.sql; column names match the database exactly.
const { datetime, index, int, longtext, mysqlEnum, mysqlTable, text, tinyint, varchar } = require('drizzle-orm/mysql-core');

const wlCmsPages = mysqlTable('wl_cms_pages', {
  pageId: int('page_id').notNull().autoincrement().primaryKey(),
  parentId: int('parent_id').notNull().default(0),
  pageName: varchar('page_name', { length: 50 }).notNull().default(''),
  friendlyUrl: varchar('friendly_url', { length: 50 }).notNull(),
  pageDescription: longtext('page_description').notNull(),
  pageShortDescription: text('page_short_description'),
  image: varchar('image', { length: 50 }).notNull(),
  // 0=Inactive,1=Active,2=Deleted
  status: mysqlEnum('status', ['0', '1', '2']).notNull().default('1'),
  pageUpdatedDate: datetime('page_updated_date', { mode: 'string' }).notNull(),
  isHome: tinyint('is_home').notNull().default(0),
}, (t) => [
  index('friendly_url').on(t.friendlyUrl),
]);

module.exports = { wlCmsPages };
