// Table `wl_brands` (MyISAM) — generated from gmcl.sql; column names match the database exactly.
const { datetime, index, int, mysqlEnum, mysqlTable, varchar } = require('drizzle-orm/mysql-core');

const wlBrands = mysqlTable('wl_brands', {
  brandId: int('brand_id').notNull().autoincrement().primaryKey(),
  brandName: varchar('brand_name', { length: 32 }).notNull().default(''),
  friendlyUrl: varchar('friendly_url', { length: 150 }),
  brandUrl: varchar('brand_url', { length: 255 }),
  brandImage: varchar('brand_image', { length: 64 }),
  brandDateAdded: datetime('brand_date_added', { mode: 'string' }),
  brandDateUpdated: datetime('brand_date_updated', { mode: 'string' }),
  sortOrder: int('sort_order'),
  // 0=Inactive,1=Active,2=Delete
  status: mysqlEnum('status', ['0', '1', '2']).notNull().default('1'),
}, (t) => [
  index('idx_mfg_name_zen').on(t.brandName),
]);

module.exports = { wlBrands };
