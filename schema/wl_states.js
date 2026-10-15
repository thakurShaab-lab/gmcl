// Table `wl_states` (InnoDB) — generated from gmcl.sql; column names match the database exactly.
const { char, datetime, int, mysqlEnum, mysqlTable, varchar } = require('drizzle-orm/mysql-core');

const wlStates = mysqlTable('wl_states', {
  id: int('id').notNull().autoincrement().primaryKey(),
  countryId: int('country_id').notNull(),
  title: varchar('title', { length: 100 }).notNull(),
  tempTitle: varchar('temp_title', { length: 250 }).notNull(),
  createdAt: datetime('created_at', { mode: 'string' }).notNull().default('0000-00-00 00:00:00'),
  isStatePopular: mysqlEnum('is_state_popular', ['0', '1']).notNull().default('0'),
  createdBy: int('created_by').notNull().default(1),
  // 1=Active,0=Inactive,2=Deleted
  status: char('status', { length: 1 }).notNull().default('1'),
});

module.exports = { wlStates };
