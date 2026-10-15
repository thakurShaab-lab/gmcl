// Table `wl_products` (MyISAM) — generated from gmcl.sql; column names match the database exactly.
const { datetime, float, int, longtext, mysqlEnum, mysqlTable, varchar } = require('drizzle-orm/mysql-core');

const wlProducts = mysqlTable('wl_products', {
  productsId: int('products_id').notNull().autoincrement().primaryKey(),
  // parent_id= last level of category 
  categoryId: int('category_id').notNull(),
  categoryLinks: varchar('category_links', { length: 80 }).notNull(),
  productName: varchar('product_name', { length: 100 }).notNull(),
  friendlyUrl: varchar('friendly_url', { length: 110 }),
  productCode: varchar('product_code', { length: 64 }).notNull(),
  productPrice: float('product_price', { precision: 15, scale: 2 }).notNull(),
  productDiscountedPrice: float('product_discounted_price', { precision: 15, scale: 2 }).notNull(),
  productsDescription: longtext('products_description').notNull(),
  productColorIds: varchar('product_color_ids', { length: 255 }),
  productSizeIds: varchar('product_size_ids', { length: 255 }),
  brandId: int('brand_id'),
  // 1=active,0=inactive,2=deleted
  status: mysqlEnum('status', ['0', '1', '2']).notNull().default('1'),
  productAddedDate: datetime('product_added_date', { mode: 'string' }).notNull(),
  productUpdatedDate: datetime('product_updated_date', { mode: 'string' }),
  productsViewed: int('products_viewed', { unsigned: true }).notNull().default(0),
  productAlt: varchar('product_alt', { length: 100 }).notNull(),
  videoUrl: varchar('video_url', { length: 255 }),
  xlsType: mysqlEnum('xls_type', ['0', '1']).notNull().default('0'),
  productQuantity: int('product_quantity').notNull().default(0),
  usedQuantity: int('used_quantity').notNull().default(0),
  dealEndDate: datetime('deal_end_date', { mode: 'string' }),
  // 0=No,1=Yes
  isTrending: mysqlEnum('is_trending', ['0', '1']).notNull().default('0'),
  // 0=No,1=Yes
  isNew: mysqlEnum('is_new', ['0', '1']).notNull().default('0'),
  // 0=No,1=Yes
  isFeatured: mysqlEnum('is_featured', ['0', '1']).notNull().default('0'),
});

module.exports = { wlProducts };
