// Table `wl_faqs` (MyISAM) — generated from gmcl.sql; column names match the database exactly.
const { datetime, int, mysqlEnum, mysqlTable, text, varchar } = require('drizzle-orm/mysql-core');

const wlFaqs = mysqlTable('wl_faqs', {
  faqId: int('faq_id').notNull().autoincrement().primaryKey(),
  faqParentId: int('faq_parent_id').notNull().default(0),
  faqQuestion: varchar('faq_question', { length: 225 }).notNull(),
  faqAnswer: text('faq_answer').notNull(),
  sortOrder: int('sort_order'),
  status: mysqlEnum('status', ['1', '2', '3']).notNull().default('1'),
  faqDateAdded: datetime('faq_date_added', { mode: 'string' }).notNull(),
});

module.exports = { wlFaqs };
