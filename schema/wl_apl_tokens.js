// Table `wl_apl_tokens` (InnoDB) — generated from gmcl.sql; column names match the database exactly.
const { int, mysqlEnum, mysqlTable, timestamp, varchar } = require('drizzle-orm/mysql-core');
const { sql } = require('drizzle-orm');

const wlAplTokens = mysqlTable('wl_apl_tokens', {
  apiTokenId: int('api_token_id').notNull().autoincrement().primaryKey(),
  userId: int('user_id').notNull().default(0),
  // 0=Normal,1=Guest 
  loginType: int('login_type').notNull().default(0),
  token: varchar('token', { length: 100 }).notNull(),
  provider: varchar('provider', { length: 100 }).notNull().default('user'),
  appType: mysqlEnum('app_type', ['android', 'ios']).default('android'),
  appId: varchar('app_id', { length: 255 }),
  createdAt: timestamp('created_at', { mode: 'string' }).notNull().default(sql`CURRENT_TIMESTAMP`),
  expiredAt: timestamp('expired_at', { mode: 'string' }),
});

module.exports = { wlAplTokens };
