// Table `tbl_admin` (MyISAM) — generated from gmcl.sql; column names match the database exactly.
const { bigint, date, datetime, float, int, mysqlEnum, mysqlTable, text, tinytext, varchar } = require('drizzle-orm/mysql-core');

const tblAdmin = mysqlTable('tbl_admin', {
  adminId: int('admin_id').notNull().autoincrement().primaryKey(),
  // 1= super admin , 2= half_admin_right,3=low_admin_right
  adminType: mysqlEnum('admin_type', ['1', '2', '3']).notNull().default('2'),
  adminKey: varchar('admin_key', { length: 15 }).notNull(),
  adminUsername: varchar('admin_username', { length: 50 }).notNull(),
  adminPassword: varchar('admin_password', { length: 30 }),
  adminEmail: varchar('admin_email', { length: 255 }).notNull(),
  litigationDays: int('litigation_days'),
  adminLastLogin: datetime('admin_last_login', { mode: 'string' }),
  address: text('address'),
  city: varchar('city', { length: 100 }),
  state: varchar('state', { length: 100 }),
  country: varchar('country', { length: 100 }),
  zipcode: varchar('zipcode', { length: 50 }),
  phone: varchar('phone', { length: 50 }),
  freeShippingOrderAmount: int('free_shipping_order_amount').notNull().default(500),
  fax: varchar('fax', { length: 50 }),
  contactPerson: varchar('contact_person', { length: 50 }),
  contactPhone: varchar('contact_phone', { length: 50 }),
  contactEmail: varchar('contact_email', { length: 50 }),
  codAmount: float('cod_amount', { precision: 10, scale: 2 }).notNull(),
  postDate: date('post_date', { mode: 'string' }).notNull(),
  status: mysqlEnum('status', ['0', '1', '2']).notNull().default('1'),
  totalHits: bigint('total_hits', { mode: 'number' }).notNull().default(0),
  facebookLink: varchar('facebook_link', { length: 250 }),
  twitterLink: varchar('twitter_link', { length: 250 }),
  linkedinLink: varchar('linkedin_link', { length: 250 }),
  instagramLink: varchar('instagram_link', { length: 250 }),
  youtubeLink: varchar('youtube_link', { length: 250 }),
  googleAnalyticsId: varchar('google_analytics_id', { length: 50 }),
  googleWebCode: text('google_web_code'),
  footerTime: varchar('footer_time', { length: 250 }),
  footerContent: varchar('footer_content', { length: 255 }),
  whatsAppMessage: tinytext('whats_app_message'),
  whatsAppNo: varchar('whats_app_no', { length: 20 }),
  websiteLink: text('website_link'),
});

module.exports = { tblAdmin };
