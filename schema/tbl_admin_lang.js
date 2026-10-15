// Table `tbl_admin_lang` (MyISAM) — generated from gmcl.sql + migrations/001_add_missing_schema.sql; column names match the database exactly.
const { index, int, mysqlTable, varchar } = require('drizzle-orm/mysql-core');

const tblAdminLang = mysqlTable('tbl_admin_lang', {
  id: int('id').notNull().autoincrement().primaryKey(),
  adminId: int('admin_id').notNull().default(1),
  languageId: varchar('language_id', { length: 10 }).notNull().default(''),
  companyName: varchar('company_name', { length: 255 }),
}, (t) => [
  index('idx_language_id').on(t.languageId),
]);

module.exports = { tblAdminLang };
