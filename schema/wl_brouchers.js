// Table `wl_brouchers` (MyISAM) — generated from gmcl.sql; column names match the database exactly.
const { datetime, index, int, mysqlEnum, mysqlTable, varchar } = require('drizzle-orm/mysql-core');

const wlBrouchers = mysqlTable('wl_brouchers', {
  broucherId: int('broucher_id').notNull().autoincrement().primaryKey(),
  broucherName: varchar('broucher_name', { length: 32 }).notNull().default(''),
  friendlyUrl: varchar('friendly_url', { length: 150 }),
  broucherUrl: varchar('broucher_url', { length: 255 }),
  broucherDoc: varchar('broucher_doc', { length: 255 }),
  mobileNumber: varchar('mobile_number', { length: 55 }),
  broucherDateAdded: datetime('broucher_date_added', { mode: 'string' }),
  broucherDateUpdated: datetime('broucher_date_updated', { mode: 'string' }),
  sortOrder: int('sort_order'),
  isFeatured: mysqlEnum('is_featured', ['1', '0']).default('0'),
  // 0=Inactive,1=Active,2=Delete
  status: mysqlEnum('status', ['0', '1', '2']).notNull().default('1'),
}, (t) => [
  index('idx_mfg_name_zen').on(t.broucherName),
]);

module.exports = { wlBrouchers };
