const env = require('./config/env'); // loads .env and the application timezone first
const app = require('./app');
const { pool, checkConnection } = require('./config/database');

const server = app.listen(env.port, () => {
  console.log(`GMCL API listening on port ${env.port} (${env.nodeEnv})`);
  checkConnection();
});

function shutdown() {
  server.close(() => pool.end().finally(() => process.exit(0)));
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
