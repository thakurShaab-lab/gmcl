// Table `wl_points_purchase_order` (InnoDB) — generated from gmcl.sql; column names match the database exactly.
const { char, datetime, float, index, int, mysqlEnum, mysqlTable, varchar } = require('drizzle-orm/mysql-core');

const wlPointsPurchaseOrder = mysqlTable('wl_points_purchase_order', {
  id: int('id').notNull().autoincrement().primaryKey(),
  orderNum: varchar('order_num', { length: 15 }).notNull(),
  userId: int('user_id').notNull(),
  userName: varchar('user_name', { length: 150 }).notNull(),
  userEmail: varchar('user_email', { length: 80 }).notNull(),
  totalPoints: int('total_points').notNull().default(0),
  totalAmount: float('total_amount', { precision: 10, scale: 2 }).notNull().default(0),
  currencyCode: char('currency_code', { length: 3 }).notNull().default('INR'),
  currencyValue: float('currency_value', { precision: 10, scale: 2 }).notNull().default(1),
  // 'Pending','Closed','Canceled','Completed','Deleted'
  orderStatus: mysqlEnum('order_status', ['Pending', 'Closed', 'Canceled', 'Completed', 'Deleted']).notNull().default('Pending'),
  orderReceivedDate: datetime('order_received_date', { mode: 'string' }),
  paymentMethod: varchar('payment_method', { length: 50 }).notNull(),
  paymentStatus: mysqlEnum('payment_status', ['Paid', 'Unpaid']).default('Unpaid'),
}, (t) => [
  index('user_id').on(t.userId),
  index('order_status').on(t.orderStatus),
  index('payment_status').on(t.paymentStatus),
]);

module.exports = { wlPointsPurchaseOrder };
