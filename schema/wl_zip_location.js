// Table `wl_zip_location` (MyISAM) — generated from gmcl.sql; column names match the database exactly.
const { datetime, index, int, mysqlEnum, mysqlTable, tinyint, varchar } = require('drizzle-orm/mysql-core');

const wlZipLocation = mysqlTable('wl_zip_location', {
  zipLocationId: int('zip_location_id').notNull().autoincrement().primaryKey(),
  locationName: varchar('location_name', { length: 32 }).notNull().default(''),
  zipCode: varchar('zip_code', { length: 50 }).notNull(),
  addedDate: datetime('added_date', { mode: 'string' }),
  status: mysqlEnum('status', ['1', '2', '3']).notNull().default('1'),
  // Y=Yes,N=No
  xlsType: mysqlEnum('xls_type', ['Y', 'N']).default('N'),
  codStatus: tinyint('cod_status').notNull().default(0),
}, (t) => [
  index('idx_mfg_name_zen').on(t.locationName),
]);

module.exports = { wlZipLocation };
