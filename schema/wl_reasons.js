// Table `wl_reasons` (MyISAM) — generated from gmcl.sql; column names match the database exactly.
const { datetime, index, int, mysqlEnum, mysqlTable, tinyint, varchar } = require('drizzle-orm/mysql-core');

const wlReasons = mysqlTable('wl_reasons', {
  reasonId: int('reason_id').notNull().autoincrement().primaryKey(),
  reasonName: varchar('reason_name', { length: 255 }).notNull(),
  // 1=cancel,2=return
  reasonType: tinyint('reason_type').notNull().default(1),
  reasonDateAdded: datetime('reason_date_added', { mode: 'string' }),
  reasonDateUpdated: datetime('reason_date_updated', { mode: 'string' }),
  sortOrder: int('sort_order'),
  // 0=Inactive,1=Active,2=Delete
  status: mysqlEnum('status', ['0', '1', '2']).notNull().default('1'),
}, (t) => [
  index('idx_mfg_name_zen').on(t.reasonName),
]);

module.exports = { wlReasons };
