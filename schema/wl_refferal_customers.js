// Table `wl_refferal_customers` (InnoDB) — generated from gmcl.sql; column names match the database exactly.
const { int, mysqlEnum, mysqlTable, varchar } = require('drizzle-orm/mysql-core');

const wlRefferalCustomers = mysqlTable('wl_refferal_customers', {
  refferId: int('reffer_id').notNull().autoincrement().primaryKey(),
  postedUser: varchar('posted_user', { length: 120 }),
  postedName: varchar('posted_name', { length: 120 }),
  refferUser: varchar('reffer_user', { length: 120 }),
  refferName: varchar('reffer_name', { length: 120 }),
  refferuserId: int('refferuser_id'),
  posterId: int('poster_id'),
  // 1=no,2=yes
  isApproved: mysqlEnum('is_approved', ['1', '2']).notNull().default('1'),
  refferalCode: varchar('refferal_code', { length: 120 }),
  status: mysqlEnum('status', ['0', '1']).default('1'),
});

module.exports = { wlRefferalCustomers };
