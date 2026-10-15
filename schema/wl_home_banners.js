// Table `wl_home_banners` (InnoDB) — generated from gmcl.sql; column names match the database exactly.
const { datetime, int, mysqlEnum, mysqlTable, varchar } = require('drizzle-orm/mysql-core');

const wlHomeBanners = mysqlTable('wl_home_banners', {
  id: int('id').notNull().autoincrement().primaryKey(),
  bannerPosition: varchar('banner_position', { length: 80 }),
  bannerImage: varchar('banner_image', { length: 200 }),
  bannerUrl: varchar('banner_url', { length: 255 }),
  lineOne: varchar('line_one', { length: 200 }),
  lineTwo: varchar('line_two', { length: 255 }),
  lineThree: varchar('line_three', { length: 255 }),
  status: mysqlEnum('status', ['1', '0', '2']).notNull(),
  addedDate: datetime('added_date', { mode: 'string' }),
  updatedDate: datetime('updated_date', { mode: 'string' }),
});

module.exports = { wlHomeBanners };
