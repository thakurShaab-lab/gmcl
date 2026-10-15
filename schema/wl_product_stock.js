// Table `wl_product_stock` (InnoDB) — generated from gmcl.sql; column names match the database exactly.
const { char, float, int, mysqlTable } = require('drizzle-orm/mysql-core');

const wlProductStock = mysqlTable('wl_product_stock', {
  stockId: int('stock_id').notNull().autoincrement().primaryKey(),
  productId: int('product_id').notNull(),
  productColor: int('product_color').notNull(),
  productSize: int('product_size').notNull(),
  productPrice: float('product_price', { precision: 10, scale: 2 }).notNull().default(0),
  productDiscountedPrice: float('product_discounted_price', { precision: 10, scale: 2 }).notNull().default(0),
  dealPrice: float('deal_price', { precision: 10, scale: 2 }).notNull().default(0),
  productQuantity: int('product_quantity').notNull().default(0),
  inventory: int('inventory').default(0),
  selectStatus: char('select_status', { length: 1 }).notNull().default('Y'),
});

module.exports = { wlProductStock };
