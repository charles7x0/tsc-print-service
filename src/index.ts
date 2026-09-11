import { loadConfig } from './config.js';
import { openDatabase } from './db/database.js';
import { SettingsRepository } from './db/settingsRepository.js';
import { createApp } from './http/app.js';

function main(): void {
  const config = loadConfig();

  // Open the settings database and seed defaults on first run.
  const db = openDatabase();
  const settings = new SettingsRepository(db);

  const app = createApp({ settings });

  const server = app.listen(config.http.port, config.http.host, () => {
    const { host, port } = config.http;
    const printer = settings.getSettings().printer;
    const mode = printer.dryRun
      ? `DRY RUN (writing to ${printer.dryRunFile})`
      : `network (${printer.ip}:${printer.port})`;
    // eslint-disable-next-line no-console
    console.log(`TSC printer server listening on http://${host}:${port}`);
    // eslint-disable-next-line no-console
    console.log(`Printer mode: ${mode}`);
  });

  const shutdown = (signal: string): void => {
    // eslint-disable-next-line no-console
    console.log(`\n${signal} received, shutting down...`);
    server.close(() => {
      db.close();
      process.exit(0);
    });
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

try {
  main();
} catch (err) {
  // eslint-disable-next-line no-console
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
}
