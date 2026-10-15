// Table `wl_orders_products` (MyISAM) — generated from gmcl.sql; column names match the database exactly.
const { customType, datetime, decimal, float, index, int, mysqlEnum, mysqlTable, text, varchar } = require('drizzle-orm/mysql-core');

const longblob = customType({ dataType: () => 'longblob' });

const wlOrdersProducts = mysqlTable('wl_orders_products', {
  ordersProductsId: int('orders_products_id').notNull().autoincrement().primaryKey(),
  ordersId: int('orders_id').notNull(),
  productsId: int('products_id'),
  productBrand: varchar('product_brand', { length: 70 }),
  productMaterial: varchar('product_material', { length: 80 }),
  productColor: varchar('product_color', { length: 70 }),
  productSize: varchar('product_size', { length: 70 }),
  productColorId: int('product_color_id'),
  productSizeId: int('product_size_id'),
  productColorCode: varchar('product_color_code', { length: 10 }),
  productName: varchar('product_name', { length: 100 }),
  productCode: varchar('product_code', { length: 100 }),
  productImage: longblob('product_image').notNull(),
  productPrice: float('product_price', { precision: 10, scale: 2 }),
  productTax: float('product_tax', { precision: 10, scale: 2 }).notNull().default(0),
  quantity: int('quantity').notNull().default(0),
  shippingCharge: decimal('shipping_charge', { precision: 11, scale: 2 }),
  isReturn: mysqlEnum('is_return', ['0', '1']).notNull().default('0'),
  reason: text('reason'),
  returnDate: datetime('return_date', { mode: 'string' }),
  isStockBack: mysqlEnum('is_stock_back', ['0', '1']).notNull().default('0'),
  cashback: int('cashback').notNull().default(0),
  img2: text('img2'),
  appId: text('app_id'),
  appType: varchar('app_type', { length: 50 }),
  reasonComment: text('reason_comment'),
  requestDate: datetime('request_date', { mode: 'string' }),
}, (t) => [
  index('order_id').on(t.ordersProductsId),
  index('order_no').on(t.ordersId),
]);

module.exports = { wlOrdersProducts };
