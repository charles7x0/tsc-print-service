import { config as loadDotenv } from 'dotenv';
import { z } from 'zod';

loadDotenv();

/** Coerce a numeric env var and validate it is a finite number. */
const numberFromEnv = z.coerce.number().finite();

/**
 * Environment-based configuration. Only the HTTP bind settings live in the
 * environment now; all printer and label settings are stored in SQLite and
 * managed through the settings API.
 */
const envSchema = z.object({
  PORT: numberFromEnv.int().positive().default(8080),
  HOST: z.string().min(1).default('0.0.0.0'),
  DB_PATH: z.string().min(1).default('./data/settings.db'),
});

export interface AppConfig {
  http: {
    port: number;
    host: string;
  };
  db: {
    path: string;
  };
}

/**
 * Load and validate the HTTP configuration from environment variables.
 * Throws a readable error if a value is invalid.
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = envSchema.safeParse(env);

  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }

  return {
    http: {
      port: parsed.data.PORT,
      host: parsed.data.HOST,
    },
    db: {
      path: parsed.data.DB_PATH,
    },
  };
}
