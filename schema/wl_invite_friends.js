// Table `wl_invite_friends` (InnoDB) — generated from gmcl.sql; column names match the database exactly.
const { datetime, int, mysqlTable, varchar } = require('drizzle-orm/mysql-core');

const wlInviteFriends = mysqlTable('wl_invite_friends', {
  inviteId: int('invite_id').notNull().autoincrement().primaryKey(),
  friendName: varchar('friend_name', { length: 100 }).notNull(),
  friendEmail: varchar('friend_email', { length: 100 }).notNull(),
  yourName: varchar('your_name', { length: 100 }).notNull(),
  yourEmail: varchar('your_email', { length: 100 }).notNull(),
  receiveDate: datetime('receive_date', { mode: 'string' }).notNull(),
  friendMobile: varchar('friend_mobile', { length: 50 }),
});

module.exports = { wlInviteFriends };
