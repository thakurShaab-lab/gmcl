// Table `wl_meta_tags` (InnoDB) — generated from gmcl.sql; column names match the database exactly.
const { index, int, mysqlEnum, mysqlTable, varchar } = require('drizzle-orm/mysql-core');

const wlMetaTags = mysqlTable('wl_meta_tags', {
  metaId: int('meta_id').notNull().autoincrement().primaryKey(),
  isFixed: mysqlEnum('is_fixed', ['Y', 'N']).notNull().default('N'),
  // name of controllers  
  entityType: varchar('entity_type', { length: 80 }),
  entityId: int('entity_id').notNull().default(0),
  pageUrl: varchar('page_url', { length: 200 }).notNull(),
  metaTitle: varchar('meta_title', { length: 80 }).notNull(),
  metaDescription: varchar('meta_description', { length: 220 }).notNull(),
  metaKeyword: varchar('meta_keyword', { length: 460 }),
  status: mysqlEnum('status', ['0', '1']).notNull().default('1'),
}, (t) => [
  index('page_url').on(t.pageUrl),
  index('entity_type').on(t.entityType),
  index('entity_id').on(t.entityId),
]);

module.exports = { wlMetaTags };
