// Table `wl_currencies` (MyISAM) — generated from gmcl.sql; column names match the database exactly.
const { char, datetime, float, int, mysqlEnum, mysqlTable, varchar } = require('drizzle-orm/mysql-core');

const wlCurrencies = mysqlTable('wl_currencies', {
  currencyId: int('currency_id').notNull().autoincrement().primaryKey(),
  title: varchar('title', { length: 32 }).notNull().default(''),
  code: varchar('code', { length: 3 }).notNull().default(''),
  symbolLeft: varchar('symbol_left', { length: 12 }).notNull(),
  symbolRight: varchar('symbol_right', { length: 12 }).notNull(),
  currImage: varchar('curr_image', { length: 250 }).notNull(),
  decimalPlace: char('decimal_place', { length: 1 }).notNull(),
  value: float('value', { precision: 15, scale: 8 }).notNull(),
  isDefault: mysqlEnum('is_default', ['Y', 'N']).notNull().default('N'),
  status: int('status').notNull(),
  dateModified: datetime('date_modified', { mode: 'string' }).notNull().default('0000-00-00 00:00:00'),
});

module.exports = { wlCurrencies };
