// Table `wl_header_images` (InnoDB) — generated from gmcl.sql; column names match the database exactly.
const { datetime, int, mysqlEnum, mysqlTable, varchar } = require('drizzle-orm/mysql-core');

const wlHeaderImages = mysqlTable('wl_header_images', {
  id: int('id').notNull().autoincrement().primaryKey(),
  headerImage: varchar('header_image', { length: 200 }).notNull(),
  headerUrl: varchar('header_url', { length: 255 }),
  lineOne: varchar('line_one', { length: 100 }),
  lineTwo: varchar('line_two', { length: 150 }),
  lineThree: varchar('line_three', { length: 200 }),
  status: mysqlEnum('status', ['1', '0', '2']).notNull(),
  addedDate: datetime('added_date', { mode: 'string' }).notNull(),
});

module.exports = { wlHeaderImages };
