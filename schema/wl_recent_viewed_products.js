// Table `wl_recent_viewed_products` (InnoDB) — generated from gmcl.sql; column names match the database exactly.
const { datetime, int, mysqlTable, varchar } = require('drizzle-orm/mysql-core');

const wlRecentViewedProducts = mysqlTable('wl_recent_viewed_products', {
  id: int('id').notNull().autoincrement().primaryKey(),
  productId: int('product_id'),
  ipAddress: varchar('ip_address', { length: 250 }),
  viewDate: datetime('view_date', { mode: 'string' }),
});

module.exports = { wlRecentViewedProducts };
