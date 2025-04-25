// src/index.ts

import dotenv from "dotenv";
import { z, ZodObject, ZodSchema, ZodError } from "zod";

// Define the expected signature of dotenv.config for typing
type DotenvConfigFunction = (options?: dotenv.DotenvConfigOptions) => dotenv.DotenvConfigOutput;

/**
 * Options for configuring `createEnv`.
 */
interface CreateEnvOptions<T extends ZodSchema> {
  /**
   * The Zod schema defining the expected environment variables.
   */
  schema: T;
  /**
   * Optional: Path to the .env file. Defaults to './.env' relative to `process.cwd()`.
   * Set to `false` to disable loading the .env file.
   */
  dotEnvPath?: string | false;

  /**
   * @internal Optional: For testing purposes, allows injecting a mock dotenv.config.
   */
  _internalDotenvConfig?: DotenvConfigFunction;
}

/**
 * Validates and parses environment variables against a Zod schema.
 * Loads variables from a `.env` file (by default) and `process.env`.
 * Throws an error if validation fails, ensuring environment safety at startup.
 *
 * @template T - The Zod schema type.
 * @param options - Configuration options including the Zod schema.
 * @returns A typed object matching the schema if validation is successful.
 */
export function createEnv<T extends ZodSchema>(
  options: CreateEnvOptions<T>
): z.infer<T> {
  // Use injected config if provided, otherwise use the real one
  const configDotenv = options._internalDotenvConfig || dotenv.config;
  const { schema, dotEnvPath = "./.env" } = options;

  if (!(schema instanceof ZodObject)) {
    throw new Error("Invalid schema provided. Expected a ZodObject.");
  }

  // 1. Load .env file if path is provided
  let dotEnvValues: Record<string, string | undefined> = {};
  if (dotEnvPath !== false) {
    // *** Use the resolved configDotenv function ***
    const result = configDotenv({ path: dotEnvPath });

    if (result.error) {
      const hasCodeProperty = Object.prototype.hasOwnProperty.call(result.error, "code");
      const errorCode = hasCodeProperty ? (result.error as NodeJS.ErrnoException).code : undefined;

      if (errorCode !== "ENOENT") {
        throw new Error(`❌ Failed to load .env file from ${dotEnvPath}: ${result.error.message}`);
      }
    }
    dotEnvValues = (!result.error && result.parsed) ? result.parsed : {};
  }

  // 2. Get Schema Defaults (handled by Zod)

  // 3. Prepare Source Object Explicitly
  const sourceForValidation: Record<string, any> = {};
  const schemaKeys = Object.keys(schema.shape);

  schemaKeys.forEach((key) => {
    const processVal = process.env[key];
    const dotenvVal = dotEnvValues[key];

    if (processVal !== undefined) {
      sourceForValidation[key] = processVal;
    } else if (dotenvVal !== undefined) {
      sourceForValidation[key] = dotenvVal;
    }
  });

  // 4. Validate with Zod Schema
  const parsed = schema.safeParse(sourceForValidation);

  // 5. Handle Validation Failure
  if (!parsed.success) {
    const { error } = parsed;
    const formattedErrors = error.errors.map((err) => `  - ${err.path.join(".")}: ${err.message}`);
    const errorMessage = `❌ Invalid environment variables:\n${formattedErrors.join("\n")}`;
    console.error(errorMessage); // Log the detailed error
    throw new Error("Environment validation failed. Check console output.");
  }

  // 6. Handle Validation Success
  return parsed.data;
}