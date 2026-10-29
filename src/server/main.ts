import pg from 'pg';
import { createApp } from './app.js';
import { loadConfig } from './config.js';
const config = loadConfig();
const pool = new pg.Pool({
  connectionString: config.databaseUrl,
  max: 10,
  connectionTimeoutMillis: 5000,
  statement_timeout: 10_000,
});
const app = await createApp(pool, config, { logger: true });
for (const signal of ['SIGTERM', 'SIGINT'] as const)
  process.once(signal, () => {
    void app
      .close()
      .then(() => pool.end())
      .catch((error) => {
        console.error(error);
        process.exitCode = 1;
      });
  });
try {
  await app.listen({ host: config.host, port: config.port });
} catch (error) {
  app.log.error(error);
  await pool.end();
  process.exitCode = 1;
}
