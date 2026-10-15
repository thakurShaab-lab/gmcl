// Table `tbl_temp_delivery_address` (InnoDB) — generated from gmcl.sql; column names match the database exactly.
const { datetime, int, mysqlEnum, mysqlTable, text, varchar } = require('drizzle-orm/mysql-core');

const tblTempDeliveryAddress = mysqlTable('tbl_temp_delivery_address', {
  userId: int('user_id').notNull(),
  id: int('id').notNull().autoincrement().primaryKey(),
  addressType: varchar('address_type', { length: 100 }),
  firstName: varchar('first_name', { length: 100 }),
  lastName: varchar('last_name', { length: 255 }),
  mobile: varchar('mobile', { length: 50 }),
  phone: varchar('phone', { length: 50 }),
  zipcode: varchar('zipcode', { length: 10 }),
  address: text('address'),
  landmark: varchar('landmark', { length: 200 }),
  location: varchar('location', { length: 255 }).default('0'),
  city: varchar('city', { length: 255 }).default('0'),
  state: varchar('state', { length: 255 }).default('0'),
  country: varchar('country', { length: 250 }),
  // 0=No, 1=Yes
  isDefault: int('is_default').notNull().default(0),
  // 0=Inactive,1=Active,2=Delete
  status: int('status').notNull().default(1),
  recivDate: datetime('reciv_date', { mode: 'string' }).notNull(),
  appId: varchar('app_id', { length: 255 }),
  appType: varchar('app_type', { length: 10 }),
  tempId: int('temp_id'),
  slotId: int('slot_id').notNull().default(0),
  longitude: varchar('longitude', { length: 255 }),
  latitude: varchar('latitude', { length: 255 }),
  atype: varchar('atype', { length: 255 }),
  block: varchar('block', { length: 255 }),
  street: varchar('street', { length: 255 }),
  defaultStatus: mysqlEnum('default_status', ['Y', 'N']).notNull().default('N'),
  houseNo: text('house_no'),
  floorNo: text('floor_no'),
  building: text('building'),
  instruction: text('instruction'),
  cityId: int('city_id'),
});

module.exports = { tblTempDeliveryAddress };
