// Table `wl_cities` (InnoDB) — generated from gmcl.sql; column names match the database exactly.
const { char, datetime, int, mysqlEnum, mysqlTable, varchar } = require('drizzle-orm/mysql-core');

const wlCities = mysqlTable('wl_cities', {
  id: int('id').notNull().autoincrement().primaryKey(),
  cityGroupId: varchar('city_group_id', { length: 200 }),
  stateId: int('state_id').notNull(),
  countryId: int('country_id').notNull().default(0),
  title: varchar('title', { length: 100 }).notNull(),
  tempTitle: varchar('temp_title', { length: 100 }).notNull(),
  premimumAdsAvl: mysqlEnum('premimum_ads_avl', ['0', '1']).notNull().default('0'),
  createdAt: datetime('created_at', { mode: 'string' }).notNull().default('0000-00-00 00:00:00'),
  isCityPopular: mysqlEnum('is_city_popular', ['0', '1']).notNull().default('0'),
  isOthercityPopular: char('is_othercity_popular', { length: 1 }).notNull().default('0'),
  createdBy: int('created_by').notNull().default(1),
  // 0=Inactive, 1=Active, 2=Deleted
  status: char('status', { length: 1 }).notNull().default('1'),
});

module.exports = { wlCities };
