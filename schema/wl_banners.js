// Table `wl_banners` (MyISAM) — generated from gmcl.sql; column names match the database exactly.
const { datetime, int, mysqlEnum, mysqlTable, varchar } = require('drizzle-orm/mysql-core');

const wlBanners = mysqlTable('wl_banners', {
  bannerId: int('banner_id').notNull().autoincrement().primaryKey(),
  bannerPosition: varchar('banner_position', { length: 100 }),
  categoryId: int('category_id').notNull().default(0),
  bannerImage: varchar('banner_image', { length: 200 }),
  bannerUrl: varchar('banner_url', { length: 170 }),
  // Like : home page,category page
  bannerPage: varchar('banner_page', { length: 30 }),
  // 1=Actice,0=Inactive
  status: mysqlEnum('status', ['1', '0']).default('1'),
  clicks: int('clicks').notNull().default(0),
  bannerAddedDate: datetime('banner_added_date', { mode: 'string' }),
  bannerStartDate: datetime('banner_start_date', { mode: 'string' }),
  bannerEndDate: datetime('banner_end_date', { mode: 'string' }),
});

module.exports = { wlBanners };
