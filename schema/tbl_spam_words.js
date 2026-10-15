// Table `tbl_spam_words` (MyISAM) — generated from gmcl.sql + migrations/001_add_missing_schema.sql; column names match the database exactly.
const { int, mysqlEnum, mysqlTable, varchar } = require('drizzle-orm/mysql-core');

const tblSpamWords = mysqlTable('tbl_spam_words', {
  id: int('id').notNull().autoincrement().primaryKey(),
  words: varchar('words', { length: 255 }).notNull(),
  status: mysqlEnum('status', ['0', '1']).notNull().default('1'),
});

module.exports = { tblSpamWords };
