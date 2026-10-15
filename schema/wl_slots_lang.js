// Table `wl_slots_lang` (MyISAM) — generated from gmcl.sql + migrations/001_add_missing_schema.sql; column names match the database exactly.
const { index, int, mysqlTable, varchar } = require('drizzle-orm/mysql-core');

const wlSlotsLang = mysqlTable('wl_slots_lang', {
  id: int('id').notNull().autoincrement().primaryKey(),
  slotId: int('slot_id').notNull(),
  languageId: varchar('language_id', { length: 10 }).notNull().default(''),
  slotName: varchar('slot_name', { length: 255 }),
}, (t) => [
  index('idx_slot_language').on(t.slotId, t.languageId),
]);

module.exports = { wlSlotsLang };
