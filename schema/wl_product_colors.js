// Table `wl_product_colors` (InnoDB) — generated from gmcl.sql; column names match the database exactly.
const { bigint, mysqlTable, varchar } = require('drizzle-orm/mysql-core');

const wlProductColors = mysqlTable('wl_product_colors', {
  id: bigint('id', { mode: 'number' }).notNull().autoincrement().primaryKey(),
  productId: bigint('product_id', { mode: 'number' }).notNull(),
  colorId: bigint('color_id', { mode: 'number' }).notNull(),
  image: varchar('image', { length: 80 }),
});

module.exports = { wlProductColors };
