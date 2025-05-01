import { z } from "zod";

// Example schema combining regular env vars and secrets
export const asyncEnvSchema = z.object({
    NODE_ENV: z.enum(["development", "production"]).default("development"),
    // From .env or process.env
    PORT: z.coerce.number().default(3000),
    LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
    // Expected from Secrets Sources
    DATABASE_URL: z.string().url(),
    THIRD_PARTY_API_KEY: z.string().min(15),
    // Potentially overridden
    FEATURE_FLAG_X: z.coerce.boolean().optional(),
});

export type AsyncEnv = z.infer<typeof asyncEnvSchema>;