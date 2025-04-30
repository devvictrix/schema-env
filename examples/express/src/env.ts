import { z } from "zod";

/**
 * Schema for an Express.js application environment.
 */
export const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production"]).default("development"),
  HOST: z.string().default("localhost"),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().url("Invalid DATABASE_URL format"),
  SESSION_SECRET: z
    .string()
    .min(10, "SESSION_SECRET must be at least 10 characters"),
  CORS_ORIGIN: z.string().url().optional(), // Optional URL
  REQUEST_LOGGING: z.coerce.boolean().default(false),
});

export type Env = z.infer<typeof envSchema>;
