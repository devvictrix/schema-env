import { z } from "zod";

/**
 * Define the schema for environment variables using Zod.
 * - `z.string().min(1)` for required non-empty strings.
 * - `z.coerce.number().int().positive()` for positive integers (coerced from string).
 * - `.default()` for optional variables with default values.
 * - `.optional()` for truly optional variables.
 * - `z.enum()` for variables with a fixed set of allowed values.
 */
export const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production"]).default("development"),
  GREETING: z.string().default("Hello"),
  TARGET: z.string().min(1, "TARGET environment variable is required"), // Required string
  LOG_LEVEL: z
    .enum(["debug", "info", "warn", "error"])
    .default("info")
    .optional(), // Optional with default
  RETRIES: z.coerce.number().int().min(0).default(3), // Optional number with default
});

// Infer the TS type from the schema
export type Env = z.infer<typeof envSchema>;
