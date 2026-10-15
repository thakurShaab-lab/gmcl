// Table `wl_categories` (MyISAM) — generated from gmcl.sql; column names match the database exactly.
const { datetime, int, mysqlEnum, mysqlTable, text, varchar } = require('drizzle-orm/mysql-core');

const wlCategories = mysqlTable('wl_categories', {
  categoryId: int('category_id').notNull().autoincrement().primaryKey(),
  categoryName: varchar('category_name', { length: 100 }).notNull(),
  friendlyUrl: varchar('friendly_url', { length: 100 }).notNull(),
  categoryImage: varchar('category_image', { length: 255 }),
  categoryDescription: text('category_description').notNull(),
  parentId: int('parent_id').notNull().default(0),
  // 1=yes,0=no
  isFooter: mysqlEnum('is_footer', ['1', '0']).notNull().default('0'),
  // 1=yes,0=no
  isTop: mysqlEnum('is_top', ['1', '0']).notNull().default('0'),
  isMenu: mysqlEnum('is_menu', ['0', '1']).notNull().default('0'),
  isFixed: mysqlEnum('is_fixed', ['0', '1']).notNull().default('0'),
  sortOrder: int('sort_order'),
  dateAdded: datetime('date_added', { mode: 'string' }),
  dateModified: datetime('date_modified', { mode: 'string' }),
  // 1=active,0=inactive,2=deleted
  status: mysqlEnum('status', ['0', '1', '2']).notNull().default('1'),
  metaTitle: varchar('meta_title', { length: 100 }),
  metaKeywords: varchar('meta_keywords', { length: 100 }),
  metaDescription: varchar('meta_description', { length: 225 }),
  categoryAlt: varchar('category_alt', { length: 200 }).notNull(),
  menuImage: varchar('menu_image', { length: 80 }),
  categoryBanner: varchar('category_banner', { length: 80 }),
});

module.exports = { wlCategories };
