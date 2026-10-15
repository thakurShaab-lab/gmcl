// Table `wl_product_sizes` (InnoDB) — generated from gmcl.sql; column names match the database exactly.
const { bigint, float, mysqlTable } = require('drizzle-orm/mysql-core');

const wlProductSizes = mysqlTable('wl_product_sizes', {
  id: bigint('id', { mode: 'number' }).notNull().autoincrement().primaryKey(),
  productId: bigint('product_id', { mode: 'number' }).notNull(),
  sizeId: bigint('size_id', { mode: 'number' }).notNull(),
  productPrice: float('product_price', { precision: 10, scale: 2 }).notNull().default(0),
  productDiscountedPrice: float('product_discounted_price', { precision: 10, scale: 2 }).notNull().default(0),
});

module.exports = { wlProductSizes };
