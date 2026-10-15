// Table `wl_testimonials` (MyISAM) — generated from gmcl.sql; column names match the database exactly.
const { datetime, int, mysqlEnum, mysqlTable, text, varchar } = require('drizzle-orm/mysql-core');

const wlTestimonials = mysqlTable('wl_testimonials', {
  testimonialId: int('testimonial_id').notNull().autoincrement().primaryKey(),
  testimonialTitle: varchar('testimonial_title', { length: 250 }),
  posterName: varchar('poster_name', { length: 250 }),
  testimonialImage: varchar('testimonial_image', { length: 250 }),
  friendlyUrl: varchar('friendly_url', { length: 100 }),
  email: varchar('email', { length: 250 }),
  testimonialDescription: text('testimonial_description'),
  photo: varchar('photo', { length: 255 }),
  postedDate: datetime('posted_date', { mode: 'string' }),
  // 1=Actice,0=Inactive
  status: mysqlEnum('status', ['1', '0']).notNull().default('0'),
});

module.exports = { wlTestimonials };
