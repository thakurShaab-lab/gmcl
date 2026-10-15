// Table `tbl_temp_cart` (InnoDB) — generated from gmcl.sql; column names match the database exactly.
const { date, float, int, mysqlTable, uniqueIndex, varchar } = require('drizzle-orm/mysql-core');

const tblTempCart = mysqlTable('tbl_temp_cart', {
  id: int('id').notNull(),
  pid: int('pid'),
  qty: int('qty'),
  availableqty: int('availableqty'),
  price: float('price', { precision: 10, scale: 2 }),
  actualPrice: float('actual_price', { precision: 10, scale: 2 }),
  discountPrice: float('discount_price', { precision: 10, scale: 2 }),
  tax: float('tax', { precision: 10, scale: 2 }).default(0),
  name: varchar('name', { length: 150 }),
  origname: varchar('origname', { length: 250 }),
  img: varchar('img', { length: 120 }),
  img2: varchar('img2', { length: 120 }),
  code: varchar('code', { length: 120 }),
  colorId: int('color_id'),
  colorName: varchar('color_name', { length: 100 }),
  sizeId: int('size_id'),
  sizeName: varchar('size_name', { length: 100 }),
  brandId: int('brand_id'),
  brandName: varchar('brand_name', { length: 80 }),
  colorCode: varchar('color_code', { length: 250 }),
  categoryId: int('category_id'),
  userId: int('user_id'),
  appId: varchar('app_id', { length: 255 }),
  appType: varchar('app_type', { length: 10 }),
  addDate: date('add_date', { mode: 'string' }).notNull().default('0000-00-00'),
}, (t) => [
  uniqueIndex('id').on(t.id),
]);

module.exports = { tblTempCart };
