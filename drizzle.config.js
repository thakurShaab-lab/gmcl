// drizzle-kit configuration (introspection/studio). The schema in ./schema mirrors the existing database;
// do not run migrations against production — the tables are owned by the existing application.
const env = require('./config/env');

module.exports = {
  dialect: 'mysql',
  schema: './schema/index.js',
  out: './drizzle',
  dbCredentials: {
    host: env.db.host,
    port: env.db.port,
    user: env.db.user,
    password: env.db.password,
    database: env.db.database,
  },
};
