import { z } from 'zod';

/**
 * The application settings that used to live in .env and now live in SQLite.
 * Only PORT/HOST remain in the environment; everything here is stored in and
 * served from the database.
 */
export const settingsSchema = z.object({
  printer: z.object({
    ip: z.string().min(1),
    port: z.number().int().positive(),
    timeoutMs: z.number().int().positive(),
    dryRun: z.boolean(),
  }),
  label: z.object({
    widthMm: z.number().positive(),
    heightMm: z.number().positive(),
    gapMm: z.number().nonnegative(),
    direction: z.union([z.literal(0), z.literal(1)]),
    mirror: z.union([z.literal(0), z.literal(1)]),
    dpmm: z.number().positive(),
  }),
});

export type Settings = z.infer<typeof settingsSchema>;

/**
 * A deep-partial update payload for the settings. Every field is optional so
 * callers can patch just what they need.
 */
export const settingsUpdateSchema = z
  .object({
    printer: z
      .object({
        ip: z.string().min(1),
        port: z.number().int().positive(),
        timeoutMs: z.number().int().positive(),
        dryRun: z.boolean(),
      })
      .partial(),
    label: z
      .object({
        widthMm: z.number().positive(),
        heightMm: z.number().positive(),
        gapMm: z.number().nonnegative(),
        direction: z.union([z.literal(0), z.literal(1)]),
        mirror: z.union([z.literal(0), z.literal(1)]),
        dpmm: z.number().positive(),
      })
      .partial(),
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
