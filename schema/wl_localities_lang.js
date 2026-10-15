// Table `wl_localities_lang` (MyISAM) — generated from gmcl.sql + migrations/001_add_missing_schema.sql; column names match the database exactly.
const { index, int, mysqlTable, varchar } = require('drizzle-orm/mysql-core');

const wlLocalitiesLang = mysqlTable('wl_localities_lang', {
  id: int('id').notNull().autoincrement().primaryKey(),
  locationId: int('location_id').notNull(),
  languageId: varchar('language_id', { length: 10 }).notNull().default(''),
  title: varchar('title', { length: 100 }),
}, (t) => [
  index('idx_location_language').on(t.locationId, t.languageId),
]);

module.exports = { wlLocalitiesLang };
