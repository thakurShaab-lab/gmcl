// Table `wl_news` (MyISAM) — generated from gmcl.sql; column names match the database exactly.
const { datetime, int, longtext, mysqlEnum, mysqlTable, varchar } = require('drizzle-orm/mysql-core');

const wlNews = mysqlTable('wl_news', {
  newsId: int('news_id').notNull().autoincrement().primaryKey(),
  newsTitle: varchar('news_title', { length: 250 }).notNull(),
  friendlyUrl: varchar('friendly_url', { length: 200 }).notNull(),
  newsImage: varchar('news_image', { length: 250 }),
  videoUrl: varchar('video_url', { length: 255 }),
  postedBy: varchar('posted_by', { length: 100 }),
  newsDescription: longtext('news_description').notNull(),
  sortOrder: int('sort_order'),
  status: mysqlEnum('status', ['1', '0']).notNull().default('1'),
  newsDateAdded: datetime('news_date_added', { mode: 'string' }).notNull(),
  newsDateUpdated: datetime('news_date_updated', { mode: 'string' }),
  altTag: varchar('alt_tag', { length: 250 }),
});

module.exports = { wlNews };
