// Table `wl_colors` (MyISAM) — generated from gmcl.sql; column names match the database exactly.
const { datetime, index, int, mysqlEnum, mysqlTable, varchar } = require('drizzle-orm/mysql-core');

const wlColors = mysqlTable('wl_colors', {
  colorId: int('color_id').notNull().autoincrement().primaryKey(),
  colorName: varchar('color_name', { length: 32 }).notNull(),
  colorCode: varchar('color_code', { length: 16 }),
  colorDateAdded: datetime('color_date_added', { mode: 'string' }),
  colorDateUpdated: datetime('color_date_updated', { mode: 'string' }),
  sortOrder: int('sort_order'),
  // 0=Inactive,1=Active,2=Delete
  status: mysqlEnum('status', ['0', '1', '2']).notNull().default('1'),
}, (t) => [
  index('idx_mfg_name_zen').on(t.colorName),
]);

module.exports = { wlColors };
