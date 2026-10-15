// Table `api_access` (InnoDB) — generated from gmcl.sql + migrations/001_add_missing_schema.sql; column names match the database exactly.
const { index, int, mysqlTable, varchar } = require('drizzle-orm/mysql-core');

const apiAccess = mysqlTable('api_access', {
  id: int('id').notNull().autoincrement().primaryKey(),
  deviceId: varchar('device_id', { length: 255 }),
  accesskey: varchar('accesskey', { length: 255 }),
}, (t) => [
  index('idx_device_id').on(t.deviceId),
]);

module.exports = { apiAccess };
