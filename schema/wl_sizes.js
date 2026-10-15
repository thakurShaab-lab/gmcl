// Table `wl_sizes` (MyISAM) — generated from gmcl.sql; column names match the database exactly.
const { datetime, index, int, mysqlEnum, mysqlTable, varchar } = require('drizzle-orm/mysql-core');

const wlSizes = mysqlTable('wl_sizes', {
  sizeId: int('size_id').notNull().autoincrement().primaryKey(),
  sizeName: varchar('size_name', { length: 32 }).notNull(),
  sizeDateAdded: datetime('size_date_added', { mode: 'string' }),
  sizeDateUpdated: datetime('size_date_updated', { mode: 'string' }),
  sortOrder: int('sort_order'),
  // 0=Inactive,1=Active,2=Delete
  status: mysqlEnum('status', ['0', '1', '2']).notNull().default('1'),
}, (t) => [
  index('idx_mfg_name_zen').on(t.sizeName),
]);

module.exports = { wlSizes };
