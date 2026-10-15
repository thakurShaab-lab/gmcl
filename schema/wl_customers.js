// Table `wl_customers` (InnoDB) — generated from gmcl.sql; column names match the database exactly.
const { date, datetime, int, mysqlEnum, mysqlTable, text, varchar } = require('drizzle-orm/mysql-core');

const wlCustomers = mysqlTable('wl_customers', {
  customersId: int('customers_id').notNull().autoincrement().primaryKey(),
  // customer  email  id used as username
  userName: varchar('user_name', { length: 80 }).notNull(),
  password: varchar('password', { length: 100 }).notNull(),
  // 0=User,1=Salesman
  customerType: int('customer_type').notNull().default(0),
  title: varchar('title', { length: 10 }),
  firstName: varchar('first_name', { length: 32 }),
  lastName: varchar('last_name', { length: 32 }),
  gender: mysqlEnum('gender', ['Male', 'Female', 'Other']).default('Male'),
  birthDate: date('birth_date', { mode: 'string' }),
  cityId: int('city_id').notNull().default(0),
  customerPhoto: varchar('customer_photo', { length: 80 }),
  phoneNumber: varchar('phone_number', { length: 32 }),
  mobileNumber: varchar('mobile_number', { length: 32 }),
  faxNumber: varchar('fax_number', { length: 32 }),
  actkey: varchar('actkey', { length: 32 }).notNull(),
  // 0=Inactive,1=Active,2=Deleted,3=Guest
  status: mysqlEnum('status', ['0', '1', '2', '3']).notNull().default('0'),
  // 0=unverfied,1=verfied
  isVerified: mysqlEnum('is_verified', ['0', '1']).notNull().default('0'),
  isVerifiedMobile: mysqlEnum('is_verified_mobile', ['0', '1']).notNull().default('0'),
  loginType: mysqlEnum('login_type', ['normal', 'facebook', 'twitter']).notNull().default('normal'),
  accountCreatedDate: datetime('account_created_date', { mode: 'string' }),
  currentLogin: datetime('current_login', { mode: 'string' }),
  lastLoginDate: datetime('last_login_date', { mode: 'string' }),
  ipAddress: varchar('ip_address', { length: 25 }).notNull(),
  // 0=unblocked,1=blocked
  isBlocked: mysqlEnum('is_blocked', ['0', '1']).notNull().default('0'),
  blockTime: datetime('block_time', { mode: 'string' }),
  numberOfLoginTry: int('number_of_login_try').notNull().default(0),
  replied: mysqlEnum('replied', ['Y', 'N']).notNull().default('N'),
  refferUser: int('reffer_user').notNull().default(0),
  refferApproved: mysqlEnum('reffer_approved', ['0', '1']).notNull().default('0'),
  aadhaarNumber: varchar('aadhaar_number', { length: 16 }),
  panNumber: varchar('pan_number', { length: 10 }),
  bankName: varchar('bank_name', { length: 80 }),
  accountHolderName: varchar('account_holder_name', { length: 80 }),
  accountNumber: varchar('account_number', { length: 20 }),
  ifscCode: varchar('ifsc_code', { length: 20 }),
  appId: text('app_id'),
  deviceId: text('device_id'),
  appType: text('app_type'),
  isFaceAuthentication: mysqlEnum('is_face_authentication', ['0', '1']).notNull().default('0'),
  // mobile OTP
  verifyCode: varchar('verify_code', { length: 10 }),
  referralCode: varchar('referral_code', { length: 20 }),
});

module.exports = { wlCustomers };
