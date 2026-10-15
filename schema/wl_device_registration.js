// Table `wl_device_registration` (InnoDB) — generated from gmcl.sql + migrations/001_add_missing_schema.sql; column names match the database exactly.
const { datetime, index, int, mysqlTable, varchar } = require('drizzle-orm/mysql-core');

const wlDeviceRegistration = mysqlTable('wl_device_registration', {
  id: int('id').notNull().autoincrement().primaryKey(),
  deviceId: varchar('device_id', { length: 250 }),
  appId: varchar('app_id', { length: 255 }),
  receiveDate: datetime('receive_date', { mode: 'string' }),
}, (t) => [
  index('idx_app_id').on(t.appId),
]);

module.exports = { wlDeviceRegistration };
