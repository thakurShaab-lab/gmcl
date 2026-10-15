// Table `wl_gallery` (MyISAM) — generated from gmcl.sql; column names match the database exactly.
const { datetime, int, mysqlEnum, mysqlTable, text, varchar } = require('drizzle-orm/mysql-core');

const wlGallery = mysqlTable('wl_gallery', {
  id: int('id').notNull().autoincrement().primaryKey(),
  albumId: int('album_id').default(0),
  title: varchar('title', { length: 255 }),
  galleryFile: varchar('gallery_file', { length: 255 }),
  thumbName: varchar('thumb_name', { length: 255 }),
  embedCode: text('embed_code'),
  // 1=Image, 2=Video
  type: mysqlEnum('type', ['1', '2']).default('1'),
  galleryDesc: text('gallery_desc'),
  countryId: int('country_id').notNull().default(0),
  // 1=Actice,0=Inactive
  status: mysqlEnum('status', ['1', '0']).default('1'),
  isExclusive: int('is_exclusive').default(0),
  isLatest: int('is_latest').default(0),
  postDate: datetime('post_date', { mode: 'string' }),
  // 1=English, 2=Portguese
  languageId: varchar('language_id', { length: 30 }).notNull().default('english'),
});

module.exports = { wlGallery };
