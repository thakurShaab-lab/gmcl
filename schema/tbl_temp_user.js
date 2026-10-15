// Table `tbl_temp_user` (InnoDB) — generated from gmcl.sql; column names match the database exactly.
const { datetime, int, mysqlEnum, mysqlTable, uniqueIndex, varchar } = require('drizzle-orm/mysql-core');

const tblTempUser = mysqlTable('tbl_temp_user', {
  tId: int('t_id').notNull().autoincrement().primaryKey(),
  userName: varchar('user_name', { length: 120 }),
  appId: int('app_id'),
  languageId: int('language_id'),
  appType: int('app_type'),
  password: varchar('password', { length: 120 }),
  registerDate: datetime('register_date', { mode: 'string' }),
  currentLogin: int('current_login'),
  status: mysqlEnum('status', ['0', '1']).default('0'),
  isVerified: mysqlEnum('is_verified', ['0', '1']).default('0'),
  ipAddress: int('ip_address'),
}, (t) => [
  uniqueIndex('t_id').on(t.tId),
]);

module.exports = { tblTempUser };
