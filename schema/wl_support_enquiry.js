// Table `wl_support_enquiry` (InnoDB) — generated from gmcl.sql; column names match the database exactly.
const { datetime, int, mysqlEnum, mysqlTable, text, tinyint, varchar } = require('drizzle-orm/mysql-core');

const wlSupportEnquiry = mysqlTable('wl_support_enquiry', {
  id: int('id').notNull().autoincrement().primaryKey(),
  customerId: int('customer_id').notNull(),
  // A=Post By Admin,U=Post By User
  postedBy: mysqlEnum('posted_by', ['U', 'A']).notNull().default('U'),
  // 0=Normal,1-Customer, 2-Vendor or Store,3=delivery Boy, 4=sales man
  memberType: mysqlEnum('member_type', ['0', '1', '2', '3', '4']).notNull().default('0'),
  email: varchar('email', { length: 80 }),
  firstName: varchar('first_name', { length: 30 }),
  lastName: varchar('last_name', { length: 30 }),
  mobileNumber: varchar('mobile_number', { length: 20 }),
  message: text('message').notNull(),
  status: mysqlEnum('status', ['1', '2']).notNull().default('1'),
  // populates status before trashing
  lastStatus: tinyint('last_status').notNull().default(0),
  // admin id
  trashedBy: int('trashed_by').notNull().default(1),
  // 1=Yes,0=No
  trashed: tinyint('trashed').notNull().default(0),
  // 1=Reverted,0=No
  isReverted: tinyint('is_reverted').notNull().default(0),
  replyStatus: mysqlEnum('reply_status', ['Y', 'N']).notNull().default('N'),
  receiveDate: datetime('receive_date', { mode: 'string' }).notNull(),
});

module.exports = { wlSupportEnquiry };
