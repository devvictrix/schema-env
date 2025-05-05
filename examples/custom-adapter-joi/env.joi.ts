import Joi from "joi";

// Define the expected shape of the validated environment
// This matches the structure validated by the Joi schema below.
export interface JoiEnv {
  NODE_ENV: "development" | "production" | "test";
  API_HOST: string;
  API_PORT: number;
  API_TIMEOUT_MS?: number; // Optional number
  ENABLE_FEATURE_X: boolean;
}

// Define the environment schema using Joi
export const joiEnvSchema = Joi.object<JoiEnv, true>({
  // <JoiEnv, true> ensures the result type matches JoiEnv
  NODE_ENV: Joi.string()
    .valid("development", "production", "test")
    .default("development"),
  API_HOST: Joi.string().hostname().required(), // Example: must be a valid hostname
  API_PORT: Joi.number().port().default(8080), // Example: must be a valid port number
  API_TIMEOUT_MS: Joi.number().integer().min(100).max(5000).optional(), // Optional number with range
  ENABLE_FEATURE_X: Joi.boolean().default(false), // Boolean, defaults to false
}).options({
  // Joi options:
  abortEarly: false, // Report all errors
  allowUnknown: true, // Allow other env vars not defined in schema (schema-env merges all sources first)
  convert: true, // Allow type coercion (e.g., string 'true' to boolean true, string '123' to number 123)
});
