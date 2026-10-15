// Table `wl_slots` (MyISAM) — generated from gmcl.sql + migrations/001_add_missing_schema.sql; column names match the database exactly.
const { int, mysqlEnum, mysqlTable } = require('drizzle-orm/mysql-core');

const wlSlots = mysqlTable('wl_slots', {
  slotId: int('slot_id').notNull().autoincrement().primaryKey(),
  // 0=Inactive,1=Active,2=Delete
  status: mysqlEnum('status', ['0', '1', '2']).notNull().default('1'),
});

module.exports = { wlSlots };
