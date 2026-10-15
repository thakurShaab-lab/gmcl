// Table `wl_reasons_lang` (MyISAM) — generated from gmcl.sql + migrations/001_add_missing_schema.sql; column names match the database exactly.
const { index, int, mysqlTable, varchar } = require('drizzle-orm/mysql-core');

const wlReasonsLang = mysqlTable('wl_reasons_lang', {
  id: int('id').notNull().autoincrement().primaryKey(),
  reasonId: int('reason_id').notNull(),
  languageId: varchar('language_id', { length: 10 }).notNull().default(''),
  reasonName: varchar('reason_name', { length: 255 }),
}, (t) => [
  index('idx_reason_language').on(t.reasonId, t.languageId),
]);

module.exports = { wlReasonsLang };
