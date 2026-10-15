// Table `wl_wishlists` (MyISAM) — generated from gmcl.sql; column names match the database exactly.
const { datetime, int, mysqlTable } = require('drizzle-orm/mysql-core');

const wlWishlists = mysqlTable('wl_wishlists', {
  wishlistsId: int('wishlists_id').notNull().autoincrement().primaryKey(),
  customerId: int('customer_id').notNull(),
  productId: int('product_id').notNull(),
  wishlistsDateAdded: datetime('wishlists_date_added', { mode: 'string' }).notNull(),
});

module.exports = { wlWishlists };
