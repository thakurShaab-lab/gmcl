// Table `wl_rating` (InnoDB) — generated from gmcl.sql; column names match the database exactly.
const { bigint, datetime, int, mysqlTable, varchar } = require('drizzle-orm/mysql-core');

const wlRating = mysqlTable('wl_rating', {
  rateId: bigint('rate_id', { mode: 'number' }).notNull().autoincrement().primaryKey(),
  customerId: int('customer_id').notNull(),
  entity: varchar('entity', { length: 15 }),
  entityId: int('entity_id').notNull(),
  rateValue: int('rate_value').notNull(),
  ipAddress: varchar('ip_address', { length: 80 }).notNull(),
  ratingDate: datetime('rating_date', { mode: 'string' }).notNull(),
});

module.exports = { wlRating };
