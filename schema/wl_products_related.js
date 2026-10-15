// Table `wl_products_related` (MyISAM) — generated from gmcl.sql; column names match the database exactly.
const { datetime, int, mysqlEnum, mysqlTable } = require('drizzle-orm/mysql-core');

const wlProductsRelated = mysqlTable('wl_products_related', {
  id: int('id').notNull().autoincrement().primaryKey(),
  productId: int('product_id').notNull(),
  relatedId: int('related_id').notNull(),
  // 1=active,0=inactive,2=deleted
  status: mysqlEnum('status', ['0', '1', '2']).notNull().default('1'),
  sortOrder: int('sort_order'),
  relatedDateAdded: datetime('related_date_added', { mode: 'string' }).notNull(),
});

module.exports = { wlProductsRelated };
