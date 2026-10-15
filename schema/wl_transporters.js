// Table `wl_transporters` (InnoDB) — generated from gmcl.sql + migrations/001_add_missing_schema.sql; column names match the database exactly.
const { datetime, index, int, mysqlEnum, mysqlTable, text, varchar } = require('drizzle-orm/mysql-core');

const wlTransporters = mysqlTable('wl_transporters', {
  transporterId: int('transporter_id').notNull().autoincrement().primaryKey(),
  userName: varchar('user_name', { length: 80 }).notNull(),
  password: varchar('password', { length: 100 }).notNull(),
  firstName: varchar('first_name', { length: 32 }),
  lastName: varchar('last_name', { length: 32 }),
  mobileNumber: varchar('mobile_number', { length: 32 }),
  avatar: varchar('avatar', { length: 80 }),
  area: int('area'),
  citye: int('citye'),
  isBlocked: mysqlEnum('is_blocked', ['0', '1']).notNull().default('0'),
  blockTime: datetime('block_time', { mode: 'string' }),
  lastLoginDate: datetime('last_login_date', { mode: 'string' }),
  currentLogin: datetime('current_login', { mode: 'string' }),
  // 0=Inactive,1=Active,2=Deleted
  status: mysqlEnum('status', ['0', '1', '2']).notNull().default('1'),
  isOnline: mysqlEnum('is_online', ['0', '1']).notNull().default('0'),
  appId: text('app_id'),
  appType: text('app_type'),
  deviceId: text('device_id'),
}, (t) => [
  index('idx_user_name').on(t.userName),
  index('idx_mobile_number').on(t.mobileNumber),
]);

module.exports = { wlTransporters };
