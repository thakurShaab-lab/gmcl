// Table `wl_whatsapp` (MyISAM) — generated from gmcl.sql; column names match the database exactly.
const { datetime, index, int, mysqlEnum, mysqlTable, varchar } = require('drizzle-orm/mysql-core');

const wlWhatsapp = mysqlTable('wl_whatsapp', {
  id: int('id').notNull().autoincrement().primaryKey(),
  personName: varchar('person_name', { length: 50 }),
  whatsappNumber: varchar('whatsapp_number', { length: 20 }),
  addedOn: datetime('added_on', { mode: 'string' }),
  // 0=Inactive,1=Active,2=Delete
  status: mysqlEnum('status', ['0', '1', '2']).notNull().default('1'),
}, (t) => [
  index('idx_mfg_name_zen').on(t.personName),
]);

module.exports = { wlWhatsapp };
