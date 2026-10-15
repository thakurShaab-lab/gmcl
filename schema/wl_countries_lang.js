// Table `wl_countries_lang` (MyISAM) — generated from gmcl.sql + migrations/001_add_missing_schema.sql; column names match the database exactly.
const { index, int, mysqlTable, varchar } = require('drizzle-orm/mysql-core');

const wlCountriesLang = mysqlTable('wl_countries_lang', {
  id: int('id').notNull().autoincrement().primaryKey(),
  countryId: int('country_id').notNull(),
  languageId: varchar('language_id', { length: 10 }).notNull().default(''),
  countryName: varchar('country_name', { length: 64 }),
}, (t) => [
  index('idx_country_language').on(t.countryId, t.languageId),
]);

module.exports = { wlCountriesLang };
