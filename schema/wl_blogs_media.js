// Table `wl_blogs_media` (MyISAM) — generated from gmcl.sql; column names match the database exactly.
const { datetime, index, int, mysqlEnum, mysqlTable, varchar } = require('drizzle-orm/mysql-core');

const wlBlogsMedia = mysqlTable('wl_blogs_media', {
  id: int('id', { unsigned: true }).notNull().autoincrement().primaryKey(),
  blogId: int('blog_id', { unsigned: true }).notNull().default(0),
  mediaType: mysqlEnum('media_type', ['photo', 'video', 'pdf']).notNull().default('photo'),
  media: varchar('media', { length: 255 }),
  isDefault: mysqlEnum('is_default', ['Y', 'N']).notNull().default('N'),
  mediaDateAdded: datetime('media_date_added', { mode: 'string' }),
}, (t) => [
  index('idx_products_images_products_id').on(t.blogId),
]);

module.exports = { wlBlogsMedia };
