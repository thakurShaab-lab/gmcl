// Table `wl_points_transaction` (InnoDB) — generated from gmcl.sql; column names match the database exactly.
const { char, datetime, index, int, mysqlEnum, mysqlTable, varchar } = require('drizzle-orm/mysql-core');

const wlPointsTransaction = mysqlTable('wl_points_transaction', {
  id: int('id').notNull().autoincrement().primaryKey(),
  // id,order_id,user_id,cashback_transaction_id,gift_order_id
  matterId: int('matter_id'),
  matterType: varchar('matter_type', { length: 20 }).notNull(),
  userId: int('user_id').notNull(),
  points: int('points').notNull(),
  currency: char('currency', { length: 3 }).notNull().default('INR'),
  // Cr, Dr
  transactionType: varchar('transaction_type', { length: 20 }).notNull(),
  causeTitle: varchar('cause_title', { length: 50 }),
  receiveDate: datetime('receive_date', { mode: 'string' }).notNull(),
  walletAmount: int('wallet_amount').default(0),
  // Cashback Coupon Code
  invoiceNumber: varchar('invoice_number', { length: 20 }),
  // wallet transaction_id
  orderId: int('order_id').notNull().default(0),
  // 1=Approve,0=Unapprove,2=Rejected
  adminStatus: mysqlEnum('admin_status', ['1', '0', '2']).notNull().default('1'),
  adminApproveDate: varchar('admin_approve_date', { length: 50 }),
}, (t) => [
  index('matter_id').on(t.matterId),
  index('matter_type').on(t.matterType),
  index('user_id').on(t.userId),
]);

module.exports = { wlPointsTransaction };
