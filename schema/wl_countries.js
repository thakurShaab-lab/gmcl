// Table `wl_countries` (InnoDB) — generated from gmcl.sql; column names match the database exactly.
const { char, index, int, mysqlEnum, mysqlTable, varchar } = require('drizzle-orm/mysql-core');

const wlCountries = mysqlTable('wl_countries', {
  id: int('id').notNull().autoincrement().primaryKey(),
  countryName: varchar('country_name', { length: 64 }).notNull(),
  countryTempName: varchar('country_temp_name', { length: 250 }).notNull(),
  countryIsoCode2: char('country_iso_code_2', { length: 2 }),
  countryIsoCode3: char('country_iso_code_3', { length: 3 }),
  addressFormatId: int('address_format_id').notNull().default(0),
  // 0=Normal,1=Featured
  isFeature: char('is_feature', { length: 1 }).notNull().default('0'),
  // 0=Premimum ads not available, 1=Premimum ads available
  premimumAdsAvl: mysqlEnum('premimum_ads_avl', ['0', '1']).notNull().default('1'),
  // 0=Inactive,1=Active,2=Deleted
  status: char('status', { length: 1 }).notNull().default('1'),
  contCurrency: varchar('cont_currency', { length: 20 }),
  TimeZone: varchar('TimeZone', { length: 32 }).notNull(),
  UTCOffset: varchar('UTC_offset', { length: 8 }).notNull(),
  createdBy: int('created_by').notNull().default(1),
}, (t) => [
  index('IDX_COUNTRIES_NAME').on(t.countryName),
]);

module.exports = { wlCountries };
