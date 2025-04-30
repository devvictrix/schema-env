import dotenv from "dotenv";
import { expand } from "dotenv-expand"; // Import the real expand function
import { z, ZodObject, ZodSchema } from "zod";

// Define the expected signature of dotenv.config for typing
type DotenvConfigFunction = (
  options?: dotenv.DotenvConfigOptions
) => dotenv.DotenvConfigOutput;

// Define the expected signature of dotenv-expand's expand function
// This is the signature the mock *and* the real function should adhere to.
type DotenvExpandFunction = (
  config: dotenv.DotenvConfigOutput
) => dotenv.DotenvConfigOutput;

/**
 * Options for configuring `createEnv`.
 */
interface CreateEnvOptions<T extends ZodSchema> {
  /**
   * The Zod schema defining the expected environment variables.
   */
  schema: T;
  /**
   * Optional: Path to the base .env file. Defaults to './.env' relative to `process.cwd()`.
   * Set to `false` to disable loading all .env files.
   * If a string path is provided, environment-specific files (e.g., `.env.development`)
   * will also be loaded based on `NODE_ENV`.
   */
  dotEnvPath?: string | false;

  /**
   * Optional: Enable variable expansion using `dotenv-expand`. Defaults to `false`.
   * Expansion is performed on the combined values from all loaded `.env` files
   * *before* merging with `process.env` and validation.
   */
  expandVariables?: boolean;

  /**
   * @internal Optional: For testing purposes, allows injecting a mock dotenv.config.
   */
  _internalDotenvConfig?: DotenvConfigFunction;

  /**
   * @internal Optional: For testing purposes, allows injecting a mock dotenv-expand function.
   */
  _internalDotenvExpand?: DotenvExpandFunction;
}

/**
 * Validates and parses environment variables against a Zod schema.
 * Loads variables from `.env` files (base and environment-specific) and `process.env`.
 * Optionally expands variables using `dotenv-expand`.
 * Throws an error if validation fails, ensuring environment safety at startup.
 *
 * @template T - The Zod schema type.
 * @param options - Configuration options including the Zod schema.
 * @returns A typed object matching the schema if validation is successful.
 */
export function createEnv<T extends ZodSchema>(
  options: CreateEnvOptions<T>
): z.infer<T> {
  // Use injected functions if provided, otherwise use the real ones
  const configDotenv = options._internalDotenvConfig || dotenv.config;
  // Get the expand function (real or mock) from options or default to the real one
  const expandDotenv = options._internalDotenvExpand || expand;
  const {
    schema,
    dotEnvPath = "./.env",
    expandVariables = false,
  } = options;

  if (!(schema instanceof ZodObject)) {
    throw new Error("Invalid schema provided. Expected a ZodObject.");
  }

  let finalDotEnvValues: dotenv.DotenvParseOutput = {};

  // 1. Load .env files if path is not disabled
  if (dotEnvPath !== false) {
    const loadEnvFile = (filePath: string): dotenv.DotenvParseOutput => {
      const result = configDotenv({ path: filePath });
      if (result.error) {
        const err = result.error as NodeJS.ErrnoException;
        const hasCodeProperty =
          err && Object.prototype.hasOwnProperty.call(err, "code");
        const errorCode = hasCodeProperty ? err.code : undefined;
        if (errorCode !== "ENOENT") {
          throw new Error(
            `❌ Failed to load .env file from ${filePath}: ${result.error.message}`
          );
        }
        return {};
      }
      return result.parsed || {};
    };

    const baseDotEnvValues = loadEnvFile(dotEnvPath);
    let envSpecificDotEnvValues: dotenv.DotenvParseOutput = {};
    const nodeEnv = process.env.NODE_ENV;
    if (nodeEnv) {
      const envSpecificPath = `./.env.${nodeEnv}`;
      envSpecificDotEnvValues = loadEnvFile(envSpecificPath);
    }

    const mergedDotEnvParsed: dotenv.DotenvParseOutput = {
      ...baseDotEnvValues,
      ...envSpecificDotEnvValues,
    };

    // 1d. Perform variable expansion if enabled
    if (
      expandVariables &&
      mergedDotEnvParsed &&
      Object.keys(mergedDotEnvParsed).length > 0
    ) {
      // Pass a structure containing a *copy* of the merged values.
      const configToExpand: dotenv.DotenvConfigOutput = {
        parsed: { ...mergedDotEnvParsed },
      };

      // Call the selected expand function (real or mock).
      // Expect it to return an object like { parsed: expandedValues }
      const expansionResult = expandDotenv(configToExpand);

      // Use the 'parsed' property from the RETURN VALUE.
      // Fall back to the original merged values if expansion somehow fails.
      finalDotEnvValues = expansionResult?.parsed || mergedDotEnvParsed || {};

    } else {
      // If not expanding or nothing to expand, use the simply merged values
      finalDotEnvValues = mergedDotEnvParsed || {};
    }
  } // end of dotEnvPath !== false

  // 2. Get Schema Defaults (Applied by Zod during parsing)

  // 3. Prepare Source Object for Validation, merging process.env last
  const sourceForValidation: Record<string, unknown> = { ...finalDotEnvValues };

  for (const key in process.env) {
    if (
      Object.prototype.hasOwnProperty.call(process.env, key) &&
      process.env[key] !== undefined
    ) {
      sourceForValidation[key] = process.env[key];
    }
  }

  // 4. Validate with Zod Schema
  const parsed = schema.safeParse(sourceForValidation);

  // 5. Handle Validation Failure
  if (!parsed.success) {
    const { error } = parsed;
    const formattedErrors = error.errors.map(
      (err) => `  - ${err.path.join(".")}: ${err.message}`
    );
    const errorMessage = `❌ Invalid environment variables:\n${formattedErrors.join("\n")}`;
    console.error(errorMessage);
    throw new Error("Environment validation failed. Check console output.");
  }

  // 6. Handle Validation Success
  return parsed.data;
}