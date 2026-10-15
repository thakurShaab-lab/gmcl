// Table `wl_enquiry` (InnoDB) — generated from gmcl.sql; column names match the database exactly.
const { datetime, int, mysqlEnum, mysqlTable, text, varchar } = require('drizzle-orm/mysql-core');

const wlEnquiry = mysqlTable('wl_enquiry', {
  id: int('id').notNull().autoincrement().primaryKey(),
  // 1=contact Us,2=service & product,3=Demo,4=quote,5=callback
  type: mysqlEnum('type', ['1', '2', '3', '4', '5']).notNull().default('1'),
  productService: varchar('product_service', { length: 255 }),
  serviceType: varchar('service_type', { length: 150 }),
  email: varchar('email', { length: 80 }).notNull(),
  firstName: varchar('first_name', { length: 30 }).notNull(),
  lastName: varchar('last_name', { length: 30 }).notNull(),
  companyName: varchar('company_name', { length: 60 }),
  country: varchar('country', { length: 200 }),
  state: varchar('state', { length: 50 }),
  city: varchar('city', { length: 50 }),
  phoneNumber: varchar('phone_number', { length: 20 }),
  extNumber: varchar('ext_number', { length: 50 }),
  mobileNumber: varchar('mobile_number', { length: 20 }),
  faxNumber: varchar('fax_number', { length: 30 }),
  address: varchar('address', { length: 220 }),
  zipcode: varchar('zipcode', { length: 10 }),
  requirement: text('requirement'),
  message: text('message').notNull(),
  status: mysqlEnum('status', ['1', '2']).notNull(),
  replyStatus: mysqlEnum('reply_status', ['Y', 'N']).notNull().default('N'),
  receiveDate: datetime('receive_date', { mode: 'string' }).notNull(),
  customersId: int('customers_id').notNull().default(0),
  productId: int('product_id').notNull().default(0),
});

module.exports = { wlEnquiry };
