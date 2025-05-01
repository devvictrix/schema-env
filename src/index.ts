import dotenv from "dotenv";
import { expand } from "dotenv-expand";
import { z, ZodError, ZodObject, ZodSchema } from "zod";

// --- Type Definitions ---

type DotenvConfigFunction = (
  options?: dotenv.DotenvConfigOptions
) => dotenv.DotenvConfigOutput;
type DotenvExpandFunction = (
  config: dotenv.DotenvConfigOutput
) => dotenv.DotenvConfigOutput;

/** Input for schema validation, potentially holding values from all sources. */
type EnvironmentInput = Record<string, unknown>;

/** Function signature for fetching secrets asynchronously. */
export type SecretSourceFunction = () => Promise<
  Record<string, string | undefined>
>;

/**
 * Base options common to both `createEnv` and `createEnvAsync`.
 */
interface CreateEnvBaseOptions<T extends ZodSchema> {
  /**
   * The Zod schema defining the expected environment variables.
   * Must be a ZodObject.
   */
  schema: T;
  /**
   * Optional: Path or array of paths to .env files to load.
   * - Defaults to './.env' relative to `process.cwd()`.
   * - If an array is provided (e.g., `['.env.base', '.env.local']`), files are loaded sequentially,
   *   with variables in later files overriding earlier ones. Non-string entries are ignored with a warning.
   * - Set to `false` to disable loading all .env files (including the environment-specific one).
   *
   * Note on Environment-Specific File: Regardless of whether a single path or an array
   * is provided (unless `dotEnvPath` is `false`), if `process.env.NODE_ENV` is set,
   * an attempt will be made to load an environment-specific file (e.g., `.env.development`)
   * *after* all files specified in `dotEnvPath` have been loaded. This environment-specific
   * file will override variables from the files specified in `dotEnvPath`.
   */
  dotEnvPath?: string | false | string[];

  /**
   * Optional: Enable variable expansion using `dotenv-expand`. Defaults to `false`.
   * Expansion is performed on the combined values from all loaded `.env` files
   * (including the environment-specific file if loaded) *before* merging with
   * `process.env` (for `createEnv`) or secrets (for `createEnvAsync`) and validation.
   * Variables in `process.env` or secrets are NOT expanded.
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
 * Options specific to the synchronous `createEnv` function.
 */
export interface CreateEnvOptions<T extends ZodSchema>
  extends CreateEnvBaseOptions<T> {}

/**
 * Options specific to the asynchronous `createEnvAsync` function.
 */
export interface CreateEnvAsyncOptions<T extends ZodSchema>
  extends CreateEnvBaseOptions<T> {
  /**
   * Optional: An array of functions that fetch secrets asynchronously.
   * Each function should return a Promise resolving to a `Record<string, string | undefined>`.
   * Secrets fetched here will override variables from `.env` files but be overridden by `process.env`.
   * Fetching errors are logged as warnings, but do not halt execution unless all sources fail.
   *
   * @example
   * ```js
   * const getSecretsFromAWS = async () => {
   *   // Your logic to fetch from AWS Secrets Manager
   *   return { DB_PASSWORD: 'fetchedPassword' };
   * }
   * const getSecretsFromVault = async () => {
   *   // Your logic to fetch from HashiCorp Vault
   *   return { API_KEY: 'fetchedApiKey' };
   * }
   *
   * createEnvAsync({
   *   schema,
   *   secretsSources: [getSecretsFromAWS, getSecretsFromVault]
   * })
   * ```
   */
  secretsSources?: SecretSourceFunction[];
}

// --- Internal Helper Functions ---

/**
 * Loads and merges environment variables from specified `.env` file paths.
 * Handles default path, single path, array paths, and environment-specific files.
 * Gracefully ignores ENOENT errors but throws on other file access errors.
 * @internal
 */
function _loadDotEnvFiles(
  dotEnvPath: string | false | string[] | undefined,
  nodeEnv: string | undefined,
  configDotenv: DotenvConfigFunction
): dotenv.DotenvParseOutput {
  if (dotEnvPath === false) {
    return {}; // Loading disabled
  }

  let mergedDotEnvParsed: dotenv.DotenvParseOutput = {};

  // Refactored loadEnvFile to handle errors more directly
  const loadEnvFile = (filePath: string): dotenv.DotenvParseOutput => {
    let result: dotenv.DotenvConfigOutput;
    try {
      // Call configDotenv - this is the primary operation that might throw unexpectedly
      result = configDotenv({ path: filePath, override: true });
    } catch (e) {
      // Catch only truly unexpected errors during the dotenv.config call itself
      throw new Error(
        `❌ Unexpected error during dotenv.config call for ${filePath}: ${e instanceof Error ? e.message : String(e)}`
      );
    }

    // Now handle the result (potential error property) returned by dotenv.config
    if (result.error) {
      const err = result.error as NodeJS.ErrnoException;
      const hasCodeProperty =
        err && Object.prototype.hasOwnProperty.call(err, "code");
      const errorCode = hasCodeProperty ? err.code : undefined;

      if (errorCode !== "ENOENT") {
        // Throw the specific "Failed to load" error for non-ENOENT issues.
        // This error will propagate up and won't be caught by the try/catch above.
        throw new Error(
          `❌ Failed to load environment file from ${filePath}: ${err.message}`
        );
      }
      // console.warn(`[schema-env] Optional env file not found, ignoring: ${filePath}`);
      return {}; // File not found (ENOENT) is ignored
    }

    // console.log(`[schema-env] Successfully loaded env file: ${filePath}`);
    return result.parsed || {};
  };

  let pathsToLoad: string[] = [];

  if (dotEnvPath === undefined) {
    pathsToLoad = ["./.env"]; // Default path
  } else if (typeof dotEnvPath === "string") {
    pathsToLoad = [dotEnvPath]; // Single path
  } else if (Array.isArray(dotEnvPath)) {
    // Filter out non-string paths from the array
    pathsToLoad = dotEnvPath.filter((path): path is string => {
      if (typeof path !== "string") {
        console.warn(
          `⚠️ [schema-env] Warning: Invalid path ignored in dotEnvPath array: ${String(path)}`
        );
        return false;
      }
      return true;
    });
  }

  // Load base files sequentially. Errors (non-ENOENT) will throw and halt here.
  for (const path of pathsToLoad) {
    const parsed = loadEnvFile(path);
    mergedDotEnvParsed = { ...mergedDotEnvParsed, ...parsed }; // Ensure later files override
  }

  // Load environment-specific file *after* base files. Errors will throw and halt here.
  if (nodeEnv) {
    const envSpecificPath = `./.env.${nodeEnv}`;
    const envSpecificParsed = loadEnvFile(envSpecificPath);
    mergedDotEnvParsed = { ...mergedDotEnvParsed, ...envSpecificParsed }; // Env-specific overrides base
  }

  return mergedDotEnvParsed;
}

/**
 * Performs variable expansion on the provided dotenv parsed values if enabled.
 * @internal
 */
function _expandDotEnvValues(
  mergedDotEnvParsed: dotenv.DotenvParseOutput,
  expandVariables: boolean | undefined,
  expandDotenv: DotenvExpandFunction
): dotenv.DotenvParseOutput {
  if (
    !expandVariables ||
    !mergedDotEnvParsed ||
    Object.keys(mergedDotEnvParsed).length === 0
  ) {
    return mergedDotEnvParsed || {};
  }

  // dotenv-expand expects a specific input structure and mutates it
  const configToExpand: dotenv.DotenvConfigOutput = {
    parsed: { ...mergedDotEnvParsed },
  };

  try {
    const expansionResult = expandDotenv(configToExpand);
    // Use the expanded results if available, fallback to original if expansion failed somehow
    return expansionResult?.parsed || mergedDotEnvParsed || {};
  } catch (e) {
    // Catch potential errors during expansion itself
    console.error(
      `❌ Error during variable expansion: ${e instanceof Error ? e.message : String(e)}`
    );
    // Return the unexpanded values as a fallback
    return mergedDotEnvParsed || {};
  }
}

/**
 * Merges values from process.env into a source object.
 * process.env values take precedence over existing values in the source object.
 * @param sourceInput - The object containing values from previous steps (e.g., .env, secrets).
 * @internal
 */
function _mergeProcessEnv(sourceInput: EnvironmentInput): EnvironmentInput {
  // Create a copy to avoid mutating the input object directly
  const sourceWithProcessEnv: EnvironmentInput = { ...sourceInput };

  // process.env overrides existing values
  for (const key in process.env) {
    if (Object.prototype.hasOwnProperty.call(process.env, key)) {
      // Ensure value is not undefined before assigning
      const value = process.env[key];
      if (value !== undefined) {
        sourceWithProcessEnv[key] = value;
      }
    }
  }
  return sourceWithProcessEnv;
}

/**
 * Validates the prepared environment input against the Zod schema.
 * @internal
 */
function _validateSchema<T extends ZodSchema>(
  schema: T,
  sourceForValidation: EnvironmentInput
): z.SafeParseReturnType<z.infer<T>, z.infer<T>> {
  if (!(schema instanceof ZodObject)) {
    // This should ideally be caught earlier, but double-check
    throw new Error(
      "Internal Error: _validateSchema called with non-ZodObject schema."
    );
  }
  // Zod applies defaults during parsing
  return schema.safeParse(sourceForValidation);
}

/**
 * Formats Zod validation errors into a user-friendly string.
 * @internal
 */
function _formatZodError(error: ZodError): string {
  const formattedErrors = error.errors.map(
    (err) => `  - ${err.path.join(".") || "UNKNOWN_PATH"}: ${err.message}`
  );
  return `❌ Invalid environment variables:\n${formattedErrors.join("\n")}`;
}

/**
 * Fetches secrets from multiple sources concurrently.
 * Logs warnings for failures but doesn't halt unless all fail.
 * @internal
 */
async function _fetchSecrets(
  secretsSources: SecretSourceFunction[] | undefined
): Promise<Record<string, string | undefined>> {
  if (!secretsSources || secretsSources.length === 0) {
    return {};
  }

  // Use Promise.allSettled to run all sources even if some fail
  const results = await Promise.allSettled(
    secretsSources.map((sourceFn, index) => {
      try {
        // Ensure the function returns a promise
        const maybePromise = sourceFn();
        if (
          maybePromise &&
          typeof (maybePromise as Promise<unknown>).then === "function"
        ) {
          return maybePromise;
        } else {
          // If it's not a promise, reject explicitly
          return Promise.reject(
            new Error(
              `Sync return value from secrets source function at index ${index}. Function must return a Promise.`
            )
          );
        }
      } catch (syncError) {
        // Catch synchronous errors in the source function itself
        return Promise.reject(
          new Error(
            `Sync error in secrets source function at index ${index}: ${syncError instanceof Error ? syncError.message : String(syncError)}`
          )
        );
      }
    })
  );

  let mergedSecrets: Record<string, string | undefined> = {};
  let successfulFetches = 0;

  results.forEach((result, index) => {
    if (result.status === "fulfilled") {
      successfulFetches++;
      // Merge fulfilled results, later sources override earlier ones
      // Ensure result.value is an object before spreading
      if (result.value && typeof result.value === "object") {
        mergedSecrets = { ...mergedSecrets, ...result.value };
      } else if (result.value !== undefined && result.value !== null) {
        // Log a warning if the resolved value isn't an object as expected
        console.warn(
          `⚠️ [schema-env] Warning: Secrets source function at index ${index} resolved with non-object value: ${typeof result.value}. Expected Record<string, string | undefined>.`
        );
      }
      // Ignore null/undefined results silently
    } else {
      // Log warning on rejection (async error or caught sync error)
      console.warn(
        `⚠️ [schema-env] Warning: Secrets source function at index ${index} failed: ${
          result.reason instanceof Error
            ? result.reason.message
            : String(result.reason)
        }`
      );
    }
  });

  // Check if all sources failed *after* iterating through results
  if (successfulFetches === 0 && secretsSources.length > 0) {
    // ADR says log warnings and continue if *at least one* succeeds.
    // If *all* fail, we still proceed but log a more prominent warning.
    console.warn(
      `⚠️ [schema-env] Warning: All ${secretsSources.length} provided secretsSources functions failed to resolve successfully.`
    );
    // We still return an empty object as per ADR (continue validation with other sources)
    return {};
  }

  return mergedSecrets;
}

// --- Public API ---

/**
 * Validates and parses environment variables synchronously against a Zod schema.
 * Loads variables from `.env` files (specified paths, base, and environment-specific) and `process.env`.
 * Optionally expands variables using `dotenv-expand`.
 * Throws an error if validation fails, ensuring environment safety at startup.
 *
 * Use this for standard synchronous initialization. For fetching secrets from
 * external systems asynchronously, use `createEnvAsync`.
 *
 * The final precedence order for variables is:
 * 1. `process.env` (Highest priority)
 * 2. Environment-specific file (e.g., `.env.production`) if `NODE_ENV` is set and `dotEnvPath` is not false.
 * 3. Files specified in `dotEnvPath` array (later files override earlier ones) / Single `dotEnvPath` file / Default `./.env` (if `dotEnvPath` is not false).
 * 4. Defaults defined in the Zod schema (Lowest priority - applied by Zod during parsing).
 *
 * Note: Variable expansion (`expandVariables: true`) happens *after* all `.env` files (2, 3) are merged,
 * but *before* merging with `process.env` (1).
 *
 * @template T - The Zod schema type (must be a ZodObject).
 * @param options - Configuration options including the Zod schema.
 * @returns A typed object matching the schema if validation is successful.
 * @throws {Error} If the provided schema is not a ZodObject.
 * @throws {Error} If a specified .env file cannot be loaded due to reasons other than not existing (e.g., permissions).
 * @throws {Error} If environment variable validation against the schema fails.
 */
export function createEnv<T extends ZodSchema>(
  options: CreateEnvOptions<T>
): z.infer<T> {
  const {
    schema,
    dotEnvPath,
    expandVariables = false,
    _internalDotenvConfig = dotenv.config,
    _internalDotenvExpand = expand,
  } = options;

  // Validate schema type early
  if (!(schema instanceof ZodObject)) {
    throw new Error("Invalid schema provided. Expected a ZodObject.");
  }

  // 1. Load .env files (respecting NODE_ENV) - Can throw sync
  const mergedDotEnvParsed = _loadDotEnvFiles(
    dotEnvPath,
    process.env.NODE_ENV,
    _internalDotenvConfig
  );

  // 2. Expand .env values if enabled - Should not throw
  const finalDotEnvValues = _expandDotEnvValues(
    mergedDotEnvParsed,
    expandVariables,
    _internalDotenvExpand
  );

  // 3. Merge with process.env
  // finalDotEnvValues (DotenvParseOutput) is compatible with EnvironmentInput expected by _mergeProcessEnv
  const sourceForValidation = _mergeProcessEnv(finalDotEnvValues);

  // 4. Validate against schema
  const parsedResult = _validateSchema(schema, sourceForValidation);

  // 5. Handle validation outcome
  if (!parsedResult.success) {
    const errorMessage = _formatZodError(parsedResult.error);
    console.error(errorMessage); // Log details
    // Throw generic error to halt execution, details are in console
    throw new Error("Environment validation failed. Check console output.");
  }

  // Return the strongly typed parsed data
  return parsedResult.data;
}

/**
 * Validates and parses environment variables asynchronously against a Zod schema.
 * Loads variables from `.env` files, optional asynchronous `secretsSources`, and `process.env`.
 * Optionally expands variables from `.env` files using `dotenv-expand`.
 * Returns a Promise that resolves with the validated environment or rejects if validation fails.
 *
 * Use this when you need to fetch secrets from external systems during startup.
 * For purely synchronous validation, use `createEnv`.
 *
 * The final precedence order for variables is:
 * 1. `process.env` (Highest priority)
 * 2. Variables fetched via `secretsSources` (Later sources override earlier ones).
 * 3. Environment-specific file (e.g., `.env.production`) if `NODE_ENV` is set and `dotEnvPath` is not false.
 * 4. Files specified in `dotEnvPath` array (later files override earlier ones) / Single `dotEnvPath` file / Default `./.env` (if `dotEnvPath` is not false).
 * 5. Defaults defined in the Zod schema (Lowest priority - applied by Zod during parsing).
 *
 * Note: Variable expansion (`expandVariables: true`) happens *after* all `.env` files (3, 4) are merged,
 * but *before* merging with `secretsSources` (2) and `process.env` (1).
 *
 * @template T - The Zod schema type (must be a ZodObject).
 * @param options - Configuration options including the Zod schema and optional `secretsSources`.
 * @returns A Promise resolving to the typed object matching the schema if validation is successful.
 * @throws {Error} If the provided schema is not a ZodObject (synchronous throw).
 * @throws {Error} If a specified .env file cannot be loaded (non-ENOENT) (synchronous throw).
 * @rejects {Error} If environment variable validation against the schema fails.
 */
export async function createEnvAsync<T extends ZodSchema>(
  options: CreateEnvAsyncOptions<T>
): Promise<z.infer<T>> {
  const {
    schema,
    dotEnvPath,
    expandVariables = false,
    secretsSources,
    _internalDotenvConfig = dotenv.config,
    _internalDotenvExpand = expand,
  } = options;

  // Validate schema type early (can throw synchronously)
  if (!(schema instanceof ZodObject)) {
    throw new Error("Invalid schema provided. Expected a ZodObject.");
  }

  // --- Synchronous Operations ---
  // Any synchronous errors thrown here (e.g., non-ENOENT fs errors during load)
  // will naturally cause the promise returned by createEnvAsync to reject.
  // 1. Load .env files (respecting NODE_ENV)
  const mergedDotEnvParsed: dotenv.DotenvParseOutput = _loadDotEnvFiles(
    dotEnvPath,
    process.env.NODE_ENV,
    _internalDotenvConfig
  );
  // 2. Expand .env values if enabled
  const expandedDotEnvValues: dotenv.DotenvParseOutput = _expandDotEnvValues(
    mergedDotEnvParsed,
    expandVariables,
    _internalDotenvExpand
  );

  // Now handle the async part
  try {
    // 3. Fetch secrets asynchronously
    const secretsValues = await _fetchSecrets(secretsSources);

    // 4. Merge sources in correct async precedence: .env -> secrets -> process.env
    // Start with expanded .env values
    const sourceBeforeProcessEnv: EnvironmentInput = {
      ...expandedDotEnvValues, // Record<string, string>
      ...secretsValues, // Record<string, string | undefined> -> This makes the combined type EnvironmentInput
    };

    // Merge process.env, which takes highest precedence
    // _mergeProcessEnv now correctly accepts EnvironmentInput
    const sourceForValidation = _mergeProcessEnv(sourceBeforeProcessEnv);

    // 5. Validate against schema
    const parsedResult = _validateSchema(schema, sourceForValidation);

    // 6. Handle validation outcome
    if (!parsedResult.success) {
      const errorMessage = _formatZodError(parsedResult.error);
      console.error(errorMessage); // Log details
      // Throw an error to cause the promise rejection
      throw new Error("Environment validation failed. Check console output.");
    }

    // Resolve the promise with the strongly typed parsed data
    return parsedResult.data;
  } catch (error) {
    // Catch errors from _fetchSecrets or validation fail above
    // Ensure it's an Error object before rejecting
    if (error instanceof Error) {
      // Reject the promise
      return Promise.reject(error);
    } else {
      // Wrap non-Error throws/rejections
      return Promise.reject(
        new Error(`An unexpected error occurred: ${String(error)}`)
      );
    }
  }
}
