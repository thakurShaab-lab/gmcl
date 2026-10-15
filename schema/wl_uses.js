// Table `wl_uses` (MyISAM) — generated from gmcl.sql; column names match the database exactly.
const { datetime, int, mysqlEnum, mysqlTable, text, varchar } = require('drizzle-orm/mysql-core');

const wlUses = mysqlTable('wl_uses', {
  pageId: int('page_id').notNull().autoincrement().primaryKey(),
  pageName: varchar('page_name', { length: 100 }).notNull(),
  friendlyUrl: varchar('friendly_url', { length: 100 }).notNull(),
  pageImage: varchar('page_image', { length: 255 }),
  pageDescription: text('page_description').notNull(),
  parentId: int('parent_id').notNull().default(0),
  // 1=yes,0=no
  isFetaured: mysqlEnum('is_fetaured', ['1', '0']).notNull().default('0'),
  sortOrder: int('sort_order'),
  dateAdded: datetime('date_added', { mode: 'string' }),
  dateModified: datetime('date_modified', { mode: 'string' }),
  // 1=active,0=inactive,2=deleted
  status: mysqlEnum('status', ['0', '1', '2']).notNull().default('1'),
  imageAlt: varchar('image_alt', { length: 200 }).notNull(),
});

module.exports = { wlUses };
