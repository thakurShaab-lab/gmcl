// Table `wl_blogs` (MyISAM) — generated from gmcl.sql; column names match the database exactly.
const { datetime, int, longtext, mysqlEnum, mysqlTable, varchar } = require('drizzle-orm/mysql-core');

const wlBlogs = mysqlTable('wl_blogs', {
  blogId: int('blog_id').notNull().autoincrement().primaryKey(),
  categoryId: int('category_id').notNull().default(0),
  blogTitle: varchar('blog_title', { length: 255 }).notNull(),
  friendlyUrl: varchar('friendly_url', { length: 100 }).notNull(),
  blogDescription: longtext('blog_description').notNull(),
  sortOrder: int('sort_order'),
  status: mysqlEnum('status', ['1', '0']).notNull().default('1'),
  blogDateAdded: datetime('blog_date_added', { mode: 'string' }).notNull(),
  blogDateUpdated: datetime('blog_date_updated', { mode: 'string' }),
  blogAlt: varchar('blog_alt', { length: 255 }),
});

module.exports = { wlBlogs };
