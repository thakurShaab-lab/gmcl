// Table `tbl_temp_delivery` (MyISAM) — generated from gmcl.sql + migrations/001_add_missing_schema.sql; column names match the database exactly.
const { index, int, mysqlTable, varchar } = require('drizzle-orm/mysql-core');

const tblTempDelivery = mysqlTable('tbl_temp_delivery', {
  id: int('id').notNull().autoincrement().primaryKey(),
  appId: varchar('app_id', { length: 255 }),
  appType: varchar('app_type', { length: 20 }),
  userId: int('user_id').notNull().default(0),
  deliveryDate: varchar('delivery_date', { length: 50 }),
  deliveryTime: varchar('delivery_time', { length: 50 }),
}, (t) => [
  index('idx_user_id').on(t.userId),
  index('idx_app_id').on(t.appId),
]);

module.exports = { tblTempDelivery };
