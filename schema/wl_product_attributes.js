// Table `wl_product_attributes` (InnoDB) — generated from gmcl.sql; column names match the database exactly.
const { bigint, date, datetime, float, int, mysqlEnum, mysqlTable, varchar } = require('drizzle-orm/mysql-core');

const wlProductAttributes = mysqlTable('wl_product_attributes', {
  attributeId: bigint('attribute_id', { mode: 'number' }).notNull().autoincrement().primaryKey(),
  productId: bigint('product_id', { mode: 'number' }).notNull(),
  quantity: int('quantity').notNull().default(0),
  usedQuantity: int('used_quantity').notNull().default(0),
  productPrice: float('product_price', { precision: 15, scale: 2 }).notNull(),
  productDiscountedPrice: float('product_discounted_price', { precision: 15, scale: 2 }).notNull(),
  stockExpectedDate: date('stock_expected_date', { mode: 'string' }),
  // 1=active,0=inactive,2=deleted
  status: mysqlEnum('status', ['0', '1', '2']).notNull().default('1'),
  attributeDateUpdated: datetime('attribute_date_updated', { mode: 'string' }).notNull(),
  variantName: varchar('variant_name', { length: 100 }),
  variantQuantity: int('variant_quantity').notNull().default(1),
  // 0->no defalt,1->defalt,
  defaultStatus: mysqlEnum('default_status', ['1', '0']).notNull().default('0'),
  xlsType: mysqlEnum('xls_type', ['0', '1']).notNull().default('0'),
  vendorId: int('vendor_id').notNull().default(0),
});

module.exports = { wlProductAttributes };
