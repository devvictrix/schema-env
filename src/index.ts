// File: src/index.ts (Updated TSDoc)

import dotenv from "dotenv";
import { expand } from "dotenv-expand";
import { z, ZodObject, ZodSchema } from "zod";

// Type definitions remain the same...
type DotenvConfigFunction = (
  options?: dotenv.DotenvConfigOptions
) => dotenv.DotenvConfigOutput;
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
   * Optional: Path or array of paths to .env files to load.
   * - Defaults to './.env' relative to `process.cwd()`.
   * - If an array is provided (e.g., `['.env.base', '.env.local']`), files are loaded sequentially,
   *   with variables in later files overriding earlier ones. Non-string entries are ignored with a warning.
   * - Set to `false` to disable loading all .env files (including the environment-specific one).
   *
   * **Note on Environment-Specific File:** Regardless of whether a single path or an array
   * is provided (unless `dotEnvPath` is `false`), if `process.env.NODE_ENV` is set,
   * an attempt will be made to load an environment-specific file (e.g., `.env.development`)
   * *after* all files specified in `dotEnvPath` have been loaded. This environment-specific
   * file will override variables from the files specified in `dotEnvPath`.
   */
  dotEnvPath?: string | false | string[]; // Type already updated previously

  /**
   * Optional: Enable variable expansion using `dotenv-expand`. Defaults to `false`.
   * Expansion is performed on the combined values from all loaded `.env` files
   * (including the environment-specific file if loaded) *before* merging with
   * `process.env` and validation.
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
 * Loads variables from `.env` files (specified paths, base, and environment-specific) and `process.env`.
 * Optionally expands variables using `dotenv-expand`.
 * Throws an error if validation fails, ensuring environment safety at startup.
 *
 * The final precedence order for variables is:
 * 1. `process.env` (Highest priority)
 * 2. Environment-specific file (e.g., `.env.production`) if `NODE_ENV` is set.
 * 3. Files specified in `dotEnvPath` array (later files override earlier ones).
 * 4. Single file specified in `dotEnvPath` string (or default `./.env`).
 * 5. Defaults defined in the Zod schema (Lowest priority - applied by Zod during parsing).
 *
 * Note: Variable expansion (`expandVariables: true`) happens *after* all `.env` files (2, 3, 4) are merged,
 * but *before* merging with `process.env` (1).
 *
 * @template T - The Zod schema type.
 * @param options - Configuration options including the Zod schema.
 * @returns A typed object matching the schema if validation is successful.
 * @throws {Error} If the provided schema is not a ZodObject.
 * @throws {Error} If a specified .env file cannot be loaded due to reasons other than not existing (e.g., permissions).
 * @throws {Error} If environment variable validation against the schema fails.
 */
export function createEnv<T extends ZodSchema>(
  options: CreateEnvOptions<T>
): z.infer<T> {
  // ... implementation remains the same as the previous step ...
  const configDotenv = options._internalDotenvConfig || dotenv.config;
  const expandDotenv = options._internalDotenvExpand || expand;
  const { schema, dotEnvPath, expandVariables = false } = options;

  if (!(schema instanceof ZodObject)) {
    throw new Error("Invalid schema provided. Expected a ZodObject.");
  }

  let finalDotEnvValues: dotenv.DotenvParseOutput = {};

  if (dotEnvPath !== false) {
    const loadEnvFile = (filePath: string): dotenv.DotenvParseOutput => {
      /* ... */
      const result = configDotenv({ path: filePath });
      if (result.error) {
        const err = result.error as NodeJS.ErrnoException;
        const hasCodeProperty =
          err && Object.prototype.hasOwnProperty.call(err, "code");
        const errorCode = hasCodeProperty ? err.code : undefined;
        if (errorCode !== "ENOENT") {
          throw new Error(
            `❌ Failed to load environment file from ${filePath}: ${result.error.message}`
          );
        }
        return {};
      }
      return result.parsed || {};
    };

    let mergedDotEnvParsed: dotenv.DotenvParseOutput = {};
    let pathsToLoad: string[] = [];

    if (dotEnvPath === undefined) {
      pathsToLoad = ["./.env"];
    } else if (typeof dotEnvPath === "string") {
      pathsToLoad = [dotEnvPath];
    } else if (Array.isArray(dotEnvPath)) {
      pathsToLoad = dotEnvPath;
    }

    for (const path of pathsToLoad) {
      if (typeof path !== "string") {
        console.warn(
          `⚠️ [schema-env] Warning: Invalid path ignored in dotEnvPath array: ${path}`
        );
        continue;
      }
      const parsed = loadEnvFile(path);
      mergedDotEnvParsed = { ...mergedDotEnvParsed, ...parsed };
    }

    const nodeEnv = process.env.NODE_ENV;
    if (nodeEnv) {
      const envSpecificPath = `./.env.${nodeEnv}`;
      const envSpecificParsed = loadEnvFile(envSpecificPath);
      mergedDotEnvParsed = { ...mergedDotEnvParsed, ...envSpecificParsed };
    }

    if (
      expandVariables &&
      mergedDotEnvParsed &&
      Object.keys(mergedDotEnvParsed).length > 0
    ) {
      const configToExpand: dotenv.DotenvConfigOutput = {
        parsed: { ...mergedDotEnvParsed },
      };
      const expansionResult = expandDotenv(configToExpand);
      finalDotEnvValues = expansionResult?.parsed || mergedDotEnvParsed || {};
    } else {
      finalDotEnvValues = mergedDotEnvParsed || {};
    }
  }

  const sourceForValidation: Record<string, unknown> = { ...finalDotEnvValues };

  for (const key in process.env) {
    if (
      Object.prototype.hasOwnProperty.call(process.env, key) &&
      process.env[key] !== undefined
    ) {
      sourceForValidation[key] = process.env[key];
    }
  }

  const parsed = schema.safeParse(sourceForValidation);

  if (!parsed.success) {
    const { error } = parsed;
    const formattedErrors = error.errors.map(
      (err) => `  - ${err.path.join(".")}: ${err.message}`
    );
    const errorMessage = `❌ Invalid environment variables:\n${formattedErrors.join("\n")}`;
    console.error(errorMessage);
    throw new Error("Environment validation failed. Check console output.");
  }

  return parsed.data;
}
