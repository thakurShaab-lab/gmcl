// Table `wl_customers_address_book` (InnoDB) — generated from gmcl.sql; column names match the database exactly.
const { datetime, int, mysqlEnum, mysqlTable, text, varchar } = require('drizzle-orm/mysql-core');

const wlCustomersAddressBook = mysqlTable('wl_customers_address_book', {
  addressId: int('address_id').notNull().autoincrement().primaryKey(),
  customerId: int('customer_id').notNull(),
  firstName: varchar('first_name', { length: 40 }),
  lastName: varchar('last_name', { length: 40 }),
  name: varchar('name', { length: 32 }),
  address: text('address'),
  mobile: varchar('mobile', { length: 25 }),
  zipcode: varchar('zipcode', { length: 25 }),
  phone: varchar('phone', { length: 25 }),
  fax: varchar('fax', { length: 50 }),
  landmark: varchar('landmark', { length: 250 }),
  city: varchar('city', { length: 250 }),
  cityId: int('city_id'),
  location: varchar('location', { length: 250 }),
  state: varchar('state', { length: 250 }),
  country: varchar('country', { length: 250 }),
  recivDate: datetime('reciv_date', { mode: 'string' }).notNull(),
  addressType: mysqlEnum('address_type', ['Bill', 'Ship']).notNull(),
  defaultStatus: mysqlEnum('default_status', ['Y', 'N']).notNull().default('N'),
  instruction: text('instruction'),
  longitude: varchar('longitude', { length: 20 }),
  latitude: varchar('latitude', { length: 20 }),
  // address type label
  atype: varchar('atype', { length: 20 }),
  street: varchar('street', { length: 20 }),
  block: varchar('block', { length: 20 }),
  houseNo: varchar('house_no', { length: 50 }),
  floorNo: varchar('floor_no', { length: 50 }),
  building: varchar('building', { length: 50 }),
  area: varchar('area', { length: 250 }),
});

module.exports = { wlCustomersAddressBook };
