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
  SECRET_KEY: z.string().min(10, "SECRET_KEY must be at least 10 characters"), // Added for example/testing
  // For multi-file/expansion examples
  FROM_BASE: z.string().optional(),
  FROM_LOCAL: z.string().optional(),
  FROM_ENV_SPECIFIC: z.string().optional(),
  OVERRIDDEN: z.string().optional(),
  BASE_URL: z.string().default("http://localhost"),
  FULL_API_URL: z.string().optional(), // e.g., ${BASE_URL}/api
  VAR_B: z.string().optional(), // For expansion example
  PORT: z.coerce.number().int().positive().default(8080), // Added PORT for multi-file/env-specific override example
});

// Infer the TS type from the schema
export type Env = z.infer<typeof envSchema>;