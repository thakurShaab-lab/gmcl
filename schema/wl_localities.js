// Table `wl_localities` (MyISAM) — generated from gmcl.sql + migrations/001_add_missing_schema.sql; column names match the database exactly.
const { index, int, mysqlEnum, mysqlTable, varchar } = require('drizzle-orm/mysql-core');

const wlLocalities = mysqlTable('wl_localities', {
  locationId: int('location_id').notNull().autoincrement().primaryKey(),
  id: int('id'),
  title: varchar('title', { length: 100 }),
  countryId: int('country_id').notNull().default(0),
  stateId: int('state_id').notNull().default(0),
  cityId: int('city_id').notNull().default(0),
  // 0=Inactive,1=Active,2=Delete
  status: mysqlEnum('status', ['0', '1', '2']).notNull().default('1'),
}, (t) => [
  index('idx_city_id').on(t.cityId),
]);

module.exports = { wlLocalities };
