// Table `wl_sessions` (MyISAM) — generated from gmcl.sql; column names match the database exactly.
const { customType, index, int, mysqlTable, primaryKey, varchar } = require('drizzle-orm/mysql-core');

const blob = customType({ dataType: () => 'blob' });

const wlSessions = mysqlTable('wl_sessions', {
  id: varchar('id', { length: 128 }).notNull(),
  ipAddress: varchar('ip_address', { length: 45 }).notNull(),
  timestamp: int('timestamp', { unsigned: true }).notNull().default(0),
  data: blob('data').notNull(),
}, (t) => [
  primaryKey({ columns: [t.id, t.ipAddress] }),
  index('ci_sessions_timestamp').on(t.timestamp),
]);

module.exports = { wlSessions };
