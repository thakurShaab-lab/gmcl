// Table `wl_news_media` (MyISAM) — generated from gmcl.sql; column names match the database exactly.
const { bigint, datetime, index, int, mysqlEnum, mysqlTable, varchar } = require('drizzle-orm/mysql-core');

const wlNewsMedia = mysqlTable('wl_news_media', {
  id: int('id', { unsigned: true }).notNull().autoincrement().primaryKey(),
  colorId: bigint('color_id', { mode: 'number' }).notNull().default(0),
  colorStatus: mysqlEnum('color_status', ['0', '1']).notNull().default('1'),
  productsId: int('products_id', { unsigned: true }).notNull(),
  mediaType: mysqlEnum('media_type', ['photo', 'video', 'pdf']).notNull().default('photo'),
  media: varchar('media', { length: 255 }).notNull(),
  productCode: varchar('product_code', { length: 255 }),
  isDefault: mysqlEnum('is_default', ['Y', 'N']).notNull().default('N'),
  sortOrder: int('sort_order'),
  mediaDateAdded: datetime('media_date_added', { mode: 'string' }).notNull(),
}, (t) => [
  index('idx_products_images_products_id').on(t.productsId),
]);

module.exports = { wlNewsMedia };
