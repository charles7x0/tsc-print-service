import { z } from 'zod';

/**
 * The application settings that used to live in .env and now live in SQLite.
 * Only PORT/HOST remain in the environment; everything here is stored in and
 * served from the database.
 *
 * The per-section schemas are defined once and reused to derive both the full
 * settings schema and the partial update schema, so field definitions can
 * never drift between the two.
 */
export const printerSchema = z.object({
  ip: z.string().min(1),
  port: z.number().int().positive(),
  timeoutMs: z.number().int().positive(),
  dryRun: z.boolean(),
});

export const labelSchema = z.object({
  widthMm: z.number().positive(),
  heightMm: z.number().positive(),
  gapMm: z.number().nonnegative(),
  direction: z.union([z.literal(0), z.literal(1)]),
  mirror: z.union([z.literal(0), z.literal(1)]),
  dpmm: z.number().positive(),
});

export const settingsSchema = z.object({
  printer: printerSchema,
  label: labelSchema,
});

export type Settings = z.infer<typeof settingsSchema>;

/**
 * A deep-partial update payload for the settings. Every field is optional so
 * callers can patch just what they need. Derived from the section schemas
 * above so it stays in lockstep with them.
 */
export const settingsUpdateSchema = z
  .object({
    printer: printerSchema.partial(),
    label: labelSchema.partial(),
  })
  .partial();

export type SettingsUpdate = z.infer<typeof settingsUpdateSchema>;

/** The default settings seeded into a fresh database. */
export const DEFAULT_SETTINGS: Settings = {
  printer: {
    ip: '192.168.0.50',
    port: 9100,
    timeoutMs: 5000,
    dryRun: true,
  },
  label: {
    widthMm: 45,
    heightMm: 75,
    gapMm: 3,
    direction: 0,
    mirror: 0,
    dpmm: 8,
  },
};
