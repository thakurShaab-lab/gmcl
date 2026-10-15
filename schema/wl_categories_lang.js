// Table `wl_categories_lang` (MyISAM) — generated from gmcl.sql + migrations/001_add_missing_schema.sql; column names match the database exactly.
const { index, int, mysqlTable, varchar } = require('drizzle-orm/mysql-core');

const wlCategoriesLang = mysqlTable('wl_categories_lang', {
  id: int('id').notNull().autoincrement().primaryKey(),
  categoryId: int('category_id').notNull(),
  languageId: varchar('language_id', { length: 10 }).notNull().default(''),
  categoryName: varchar('category_name', { length: 255 }),
}, (t) => [
  index('idx_category_language').on(t.categoryId, t.languageId),
]);

module.exports = { wlCategoriesLang };
