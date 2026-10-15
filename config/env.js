const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });

// PHP had no explicit timezone; production logs show Asia/Kolkata. All PHP date() output depends on this.
process.env.TZ = process.env.APP_TIMEZONE || 'Asia/Kolkata';

module.exports = {
  nodeEnv: process.env.NODE_ENV || 'Development',
  port: Number(process.env.PORT) || 3001,
  db: {
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    connectionLimit: Number(process.env.DB_POOL_SIZE) || 10,
  },
  // PHP built base_url() from the request host; set APP_BASE_URL to pin it (must end with "/").
  baseUrl: process.env.APP_BASE_URL || '',
  // PHP UPLOAD_DIR = <document root>/uploaded_files
  uploadDir: path.resolve(process.env.UPLOAD_DIR || path.join(__dirname, '..', 'uploaded_files')),
  mail: {
    host: process.env.MAIL_HOST || '',
    port: Number(process.env.MAIL_PORT) || 587,
    secure: process.env.MAIL_SECURE === 'true',
    user: process.env.MAIL_USER || '',
    pass: process.env.MAIL_PASS || '',
  },
};
