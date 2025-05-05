// File: src/index.ts

// TSDoc comments updated for adapters

import fs from "node:fs"; // <--- Added Node.js fs import
import dotenv from "dotenv";
import { expand } from "dotenv-expand";
// Use z.AnyZodObject for constraints where appropriate
import { z, ZodError, ZodObject } from "zod";

// --- Type Definitions ---

// Removed DotenvConfigFunction type as it's no longer used
type DotenvExpandFunction = (
  config: dotenv.DotenvConfigOutput
) => dotenv.DotenvConfigOutput;

/** Input for schema validation, potentially holding values from all sources. */
type EnvironmentInput = Record<string, unknown>;

/** Function signature for fetching secrets asynchronously. */
export type SecretSourceFunction = () => Promise<
  Record<string, string | undefined>
>;

// --- Validation Adapter Types (as per ADR-009) ---

/** Standardized error format for validation failures. */
export interface StandardizedValidationError {
  /** Path to the invalid field. */
  path: (string | number)[];
  /** Description of the validation failure. */
  message: string;
}

/** Standardized result structure for validation adapters. */
export type ValidationResult<TResult> =
  | { success: true; data: TResult }
  | {
      success: false;
      error: { issues: StandardizedValidationError[] };
    };

/**
 * Interface for validation library adapters.
 * Allows plugging in different validation libraries (Zod, Joi, Yup, etc.).
 * @template TResult The expected shape of the validated environment object.
 */
export interface ValidatorAdapter<TResult> {
  /**
   * Validates the merged environment data.
   * @param data The raw, merged environment data object.
   * @returns A `ValidationResult` indicating success or failure.
   */
  validate(data: EnvironmentInput): ValidationResult<TResult>;
}

// --- Options Interfaces (Corrected ZodObject constraint) ---

/**
 * Base options common to both `createEnv` and `createEnvAsync`.
 * You must provide EITHER `schema` (for default Zod validation) OR `validator`.
 *
 * @template TSchema The Zod object schema type if using the default Zod validator.
 * @template TResult The expected type of the validated environment object.
 */
interface CreateEnvBaseOptions<
  TSchema extends z.ZodSchema | undefined,
  TResult,
> {
  /**
   * The Zod schema defining expected environment variables.
   * Required if a custom `validator` is NOT provided.
   * If provided, it MUST be a `z.object({...})`.
   * Mutually exclusive with `validator`.
   */
  schema?: TSchema;

  /**
   * A custom validation adapter instance conforming to the `ValidatorAdapter` interface.
   * Required if `schema` is NOT provided.
   * If provided, the return type `TResult` must typically be specified via a
   * generic type argument on `createEnv`/`createEnvAsync` (e.g., `createEnv<undefined, MyType>({...})`).
   * Mutually exclusive with `schema`.
   */
  validator?: ValidatorAdapter<TResult>;

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

  // Removed _internalDotenvConfig
  /** @internal */
  _internalDotenvExpand?: DotenvExpandFunction;
}

// --- Specialized Options Interfaces (Corrected ZodObject constraint) ---

/**
 * Options for the synchronous `createEnv` function.
 * Requires either `schema` (a Zod object schema) OR `validator`.
 *
 * @template TSchema The Zod object schema type if using the default Zod validator.
 * @template TResult The expected type of the validated environment object. Inferred if TSchema is provided.
 */
// Use AnyZodObject for inference constraint
export type CreateEnvOptions<
  TSchema extends z.AnyZodObject | undefined,
  TResult = TSchema extends z.AnyZodObject ? z.infer<TSchema> : unknown,
> = CreateEnvBaseOptions<TSchema, TResult>;

/**
 * Options for the asynchronous `createEnvAsync` function.
 * Requires either `schema` (a Zod object schema) OR `validator`.
 *
 * @template TSchema The Zod object schema type if using the default Zod validator.
 * @template TResult The expected type of the validated environment object. Inferred if TSchema is provided.
 */
// Use AnyZodObject for inference constraint
export interface CreateEnvAsyncOptions<
  TSchema extends z.AnyZodObject | undefined,
  TResult = TSchema extends z.AnyZodObject ? z.infer<TSchema> : unknown,
> extends CreateEnvBaseOptions<TSchema, TResult> {
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
   *   schema, // Or validator
   *   secretsSources: [getSecretsFromAWS, getSecretsFromVault]
   * })
   * ```
   */
  secretsSources?: SecretSourceFunction[];
}

// --- Default Zod Adapter Implementation (Corrected ZodObject constraint) ---

/**
 * Default implementation of ValidatorAdapter using Zod.
 * @internal
 */
// Use AnyZodObject for the constraint here
class ZodValidatorAdapter<T extends z.AnyZodObject>
  implements ValidatorAdapter<z.infer<T>>
{
  constructor(private schema: T) {}

  validate(data: EnvironmentInput): ValidationResult<z.infer<T>> {
    const result = this.schema.safeParse(data);
    if (result.success) {
      return { success: true, data: result.data };
    } else {
      return {
        success: false,
        error: {
          // Map Zod errors to standardized format
          issues: result.error.errors.map((zodError) => ({
            path: zodError.path,
            message: zodError.message,
          })),
        },
      };
    }
  }
}

// --- Internal Helper Functions (Updated) ---

/**
 * Loads and merges environment variables from specified `.env` file paths using fs.
 * Handles default path, single path, array paths, and environment-specific files.
 * Gracefully ignores ENOENT errors but throws on other file access errors.
 * PREVENTS mutation of process.env during loading.
 * @internal
 */
function _loadDotEnvFiles(
  dotEnvPath: string | false | string[] | undefined,
  nodeEnv: string | undefined
): dotenv.DotenvParseOutput {
  if (dotEnvPath === false) {
    return {}; // Loading disabled
  }

  let mergedDotEnvParsed: dotenv.DotenvParseOutput = {};

  // Use Node.js 'fs' module to read files directly
  const loadEnvFile = (filePath: string): dotenv.DotenvParseOutput => {
    try {
      // Read the file content
      const fileContent = fs.readFileSync(filePath, { encoding: "utf8" });
      // Parse the content using dotenv's parser
      const parsed = dotenv.parse(fileContent);
      // console.log(`[schema-env] Successfully parsed env file: ${filePath}`);
      return parsed;
    } catch (e) {
      const err = e as NodeJS.ErrnoException;
      if (err.code !== "ENOENT") {
        // Throw actual file reading errors (permissions, etc.)
        throw new Error(
          `❌ Failed to load environment file from ${filePath}: ${err.message}`
        );
      }
      // console.warn(`[schema-env] Optional env file not found, ignoring: ${filePath}`);
      return {}; // File not found (ENOENT) is ignored
    }
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
          `⚠️ [schema-env] Warning: Invalid path ignored in dotEnvPath array: ${String(
            path
          )}`
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
  // Use the NODE_ENV value passed in (which should reflect process.env)
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
      `❌ Error during variable expansion: ${
        e instanceof Error ? e.message : String(e)
      }`
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
  // --- Add Debug Log ---
  // console.log("DEBUG: [_mergeProcessEnv] sourceInput:", sourceInput);
  // console.log("DEBUG: [_mergeProcessEnv] process.env.TARGET:", process.env.TARGET);
  // --- End Debug Log ---

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
  // --- Add Debug Log ---
  // console.log("DEBUG: [_mergeProcessEnv] result:", sourceWithProcessEnv);
  // --- End Debug Log ---
  return sourceWithProcessEnv;
}

/**
 * Formats validation errors from the standardized result into a user-friendly string.
 * Renamed from _formatZodError.
 * @internal
 */
function _formatValidationError(
  error: { issues: StandardizedValidationError[] } | ZodError
): string {
  let issues: StandardizedValidationError[];

  // Check if it's a ZodError or the standardized structure
  if (error instanceof ZodError) {
    // Map Zod errors if necessary (e.g., if called directly with ZodError, though unlikely now)
    issues = error.errors.map((err) => ({
      path: err.path,
      message: err.message,
    }));
  } else if (error && Array.isArray(error.issues)) {
    issues = error.issues;
  } else {
    // Fallback for unexpected error format
    return "❌ Unknown validation error occurred.";
  }

  const formattedErrors = issues.map(
    (err) => `  - ${err.path.join(".") || "UNKNOWN_PATH"}: ${err.message}`
  );
  return `❌ Invalid environment variables:\n${formattedErrors.join("\n")}`;
}

/**
 * Validates the prepared environment input using the chosen validation adapter.
 * Replaces the old _validateSchema.
 * @internal
 */
function _validateEnvironment<TResult>(
  adapter: ValidatorAdapter<TResult>,
  sourceForValidation: EnvironmentInput
): ValidationResult<TResult> {
  // Adapter handles the validation logic internally
  return adapter.validate(sourceForValidation);
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
            `Sync error in secrets source function at index ${index}: ${
              syncError instanceof Error ? syncError.message : String(syncError)
            }`
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
      `⚠️ [schema-env] Warning: All ${
        secretsSources.length
      } provided secretsSources functions failed to resolve successfully.`
    );
    // We still return an empty object as per ADR (continue validation with other sources)
    return {};
  }

  return mergedSecrets;
}

/**
 * Determines the correct validator adapter based on options.
 * Checks for mutual exclusivity and ensures a valid adapter (either default Zod or custom) is available.
 * @internal
 * @template TSchema The Zod object schema type if provided.
 * @template TResult The expected result type.
 * @param options The base options containing `schema` and/or `validator`.
 * @returns The determined `ValidatorAdapter`.
 * @throws {Error} If both `schema` and `validator` are provided.
 * @throws {Error} If `schema` is provided but is not a `ZodObject`.
 * @throws {Error} If neither `schema` nor `validator` is provided.
 */
function _getValidatorAdapter<
  // Use AnyZodObject here for the constraint
  TSchema extends z.AnyZodObject | undefined,
  TResult = TSchema extends z.AnyZodObject ? z.infer<TSchema> : unknown,
>(options: CreateEnvBaseOptions<TSchema, TResult>): ValidatorAdapter<TResult> {
  const { schema, validator } = options;

  // 1. Check for mutual exclusivity
  if (schema && validator) {
    throw new Error("Cannot provide both 'schema' and 'validator' options.");
  }

  // 2. Use custom validator if provided
  if (validator) {
    // Type assertion needed here because TResult is determined by the caller's generic
    return validator as ValidatorAdapter<TResult>;
  }

  // 3. Use default Zod adapter if schema is provided and valid
  if (schema) {
    // The runtime check remains instanceof ZodObject
    if (!(schema instanceof ZodObject)) {
      throw new Error(
        "Invalid 'schema' provided. Expected a ZodObject when 'validator' is not used."
      );
    }
    // We know schema is a ZodObject here due to the runtime check
    // Cast needed to align with the broader TResult generic
    return new ZodValidatorAdapter(
      schema
    ) as unknown as ValidatorAdapter<TResult>;
  }

  // 4. Throw if neither is provided
  throw new Error("Must provide either a 'schema' or a 'validator' option.");
}

// --- Public API (Updated Types) ---

/**
 * Validates and parses environment variables synchronously.
 * Supports Zod schema validation (default via `schema` option) or a custom
 * validation library via the `validator` option.
 *
 * Loads variables from `.env` files (specified paths, base, and environment-specific) and `process.env`.
 * Optionally expands variables using `dotenv-expand`.
 * Throws an error if validation fails, ensuring environment safety at startup.
 *
 * Use this for standard synchronous initialization. For fetching secrets from
 * external systems asynchronously, use `createEnvAsync`.
 *
 * You **must** provide either the `schema` option (for default Zod validation)
 * or the `validator` option (for custom validation), but not both.
 *
 * The final precedence order for variables is:
 * 1. `process.env` (Highest priority)
 * 2. Environment-specific file (e.g., `.env.production`) if `NODE_ENV` is set and `dotEnvPath` is not false.
 * 3. Files specified in `dotEnvPath` array (later files override earlier ones) / Single `dotEnvPath` file / Default `./.env` (if `dotEnvPath` is not false).
 * 4. Defaults defined in the validation schema/logic (Lowest priority - applied by Zod or custom adapter during validation).
 *
 * Note: Variable expansion (`expandVariables: true`) happens *after* all `.env` files (2, 3) are merged,
 * but *before* merging with `process.env` (1).
 *
 * @template TSchema - The Zod object schema type (`z.AnyZodObject`) if using default validation. Leave `undefined` if using `validator`.
 * @template TResult - The expected type of the validated environment object. Inferred from TSchema if using Zod, otherwise requires explicit specification (e.g., `createEnv<undefined, MyCustomType>({ validator: ... })`).
 * @param options - Configuration options. Requires either `schema` OR `validator`.
 * @returns {TResult} The validated environment object.
 * @throws {Error} If validation fails, options are invalid (e.g., both `schema` and `validator` provided, or neither), or file loading encounters critical errors.
 */
// Use AnyZodObject for the TSchema constraint
export function createEnv<
  TSchema extends z.AnyZodObject | undefined,
  TResult = TSchema extends z.AnyZodObject ? z.infer<TSchema> : unknown,
>(options: CreateEnvOptions<TSchema, TResult>): TResult {
  const {
    dotEnvPath,
    expandVariables = false,
    _internalDotenvExpand = expand, // _internalDotenvConfig removed
  } = options;

  // 1. Determine validator adapter (throws on invalid option combinations)
  const adapter = _getValidatorAdapter(options);

  // 2. Load .env files (respecting NODE_ENV) - Can throw sync
  const mergedDotEnvParsed = _loadDotEnvFiles(
    dotEnvPath,
    process.env.NODE_ENV // Use actual process.env value here for deciding which env-specific file to load
    // _internalDotenvConfig removed from call
  );

  // 3. Expand .env values if enabled - Should not throw
  const finalDotEnvValues = _expandDotEnvValues(
    mergedDotEnvParsed,
    expandVariables,
    _internalDotenvExpand
  );

  // 4. Merge with process.env
  const sourceForValidation = _mergeProcessEnv(finalDotEnvValues);

  // --- Add Debug Log ---
  // console.log("--- DEBUG [createEnv] ---");
  // console.log("Incoming process.env.NODE_ENV:", process.env.NODE_ENV);
  // console.log("Incoming process.env.TARGET:", process.env.TARGET);
  // console.log("mergedDotEnvParsed (from files):", mergedDotEnvParsed);
  // console.log("finalDotEnvValues (after expansion):", finalDotEnvValues);
  // console.log(
  //   "sourceForValidation (final merge before validation):",
  //   sourceForValidation
  // );
  // console.log("--- END DEBUG [createEnv] ---");
  // --- End Debug Log ---

  // 5. Validate against schema using the chosen adapter
  const validationResult = _validateEnvironment(adapter, sourceForValidation);

  // 6. Handle validation outcome
  if (!validationResult.success) {
    // Use the updated error formatter
    const errorMessage = _formatValidationError(validationResult.error);
    console.error(errorMessage); // Log details
    throw new Error("Environment validation failed. Check console output.");
  }

  // Return the strongly typed parsed data
  return validationResult.data;
}

/**
 * Validates and parses environment variables asynchronously.
 * Supports Zod schema validation (default via `schema` option) or a custom
 * validation library via the `validator` option.
 *
 * Loads variables from `.env` files, optional asynchronous `secretsSources`, and `process.env`.
 * Optionally expands variables from `.env` files using `dotenv-expand`.
 * Returns a Promise that resolves with the validated environment or rejects if validation fails.
 *
 * Use this when you need to fetch secrets from external systems during startup.
 * For purely synchronous validation, use `createEnv`.
 *
 * You **must** provide either the `schema` option (for default Zod validation)
 * or the `validator` option (for custom validation), but not both.
 *
 * The final precedence order for variables is:
 * 1. `process.env` (Highest priority)
 * 2. Variables fetched via `secretsSources` (Later sources override earlier ones).
 * 3. Environment-specific file (e.g., `.env.production`) if `NODE_ENV` is set and `dotEnvPath` is not false.
 * 4. Files specified in `dotEnvPath` array (later files override earlier ones) / Single `dotEnvPath` file / Default `./.env` (if `dotEnvPath` is not false).
 * 5. Defaults defined in the validation schema/logic (Lowest priority - applied by Zod or custom adapter during validation).
 *
 * Note: Variable expansion (`expandVariables: true`) happens *after* all `.env` files (3, 4) are merged,
 * but *before* merging with `secretsSources` (2) and `process.env` (1).
 *
 * @template TSchema - The Zod object schema type (`z.AnyZodObject`) if using default validation. Leave `undefined` if using `validator`.
 * @template TResult - The expected type of the validated environment object. Inferred from TSchema if using Zod, otherwise requires explicit specification (e.g., `createEnvAsync<undefined, MyCustomType>({ validator: ... })`).
 * @param options - Configuration options. Requires either `schema` OR `validator`.
 * @returns {Promise<TResult>} A Promise resolving to the validated environment object.
 * @throws {Error} If options are invalid (e.g., both `schema` and `validator` provided, or neither) (synchronous throw).
 * @throws {Error} If synchronous file loading encounters critical errors (synchronous throw).
 * @rejects {Error} If asynchronous operations or validation fail.
 */
// Use AnyZodObject for the TSchema constraint
export async function createEnvAsync<
  TSchema extends z.AnyZodObject | undefined,
  TResult = TSchema extends z.AnyZodObject ? z.infer<TSchema> : unknown,
>(options: CreateEnvAsyncOptions<TSchema, TResult>): Promise<TResult> {
  const {
    dotEnvPath,
    expandVariables = false,
    secretsSources,
    _internalDotenvExpand = expand, // _internalDotenvConfig removed
  } = options;

  // 1. Determine validator adapter (throws on invalid option combinations)
  // This synchronous check happens before any async operations.
  const adapter = _getValidatorAdapter(options);

  // --- Synchronous Operations ---
  // Any synchronous errors thrown here will cause the promise to reject implicitly.
  // 2. Load .env files (respecting NODE_ENV)
  const mergedDotEnvParsed: dotenv.DotenvParseOutput = _loadDotEnvFiles(
    dotEnvPath,
    process.env.NODE_ENV // Use actual process.env value here for deciding which env-specific file to load
    // _internalDotenvConfig removed from call
  );
  // 3. Expand .env values if enabled
  const expandedDotEnvValues: dotenv.DotenvParseOutput = _expandDotEnvValues(
    mergedDotEnvParsed,
    expandVariables,
    _internalDotenvExpand
  );

  // Now handle the async part
  try {
    // 4. Fetch secrets asynchronously
    const secretsValues = await _fetchSecrets(secretsSources);

    // 5. Merge sources in correct async precedence: .env -> secrets -> process.env
    const sourceBeforeProcessEnv: EnvironmentInput = {
      ...expandedDotEnvValues,
      ...secretsValues,
    };
    const sourceForValidation = _mergeProcessEnv(sourceBeforeProcessEnv);

    // --- Add Debug Log ---
    // console.log("--- DEBUG [createEnvAsync] ---");
    // console.log("Incoming process.env.NODE_ENV:", process.env.NODE_ENV);
    // console.log("Incoming process.env.TARGET:", process.env.TARGET);
    // console.log("mergedDotEnvParsed (from files):", mergedDotEnvParsed);
    // console.log("expandedDotEnvValues (after expansion):", expandedDotEnvValues);
    // console.log("secretsValues (from sources):", secretsValues);
    // console.log(
    //   "sourceBeforeProcessEnv (.env+secrets):",
    //   sourceBeforeProcessEnv
    // );
    // console.log(
    //   "sourceForValidation (final merge before validation):",
    //   sourceForValidation
    // );
    // console.log("--- END DEBUG [createEnvAsync] ---");
    // --- End Debug Log ---

    // 6. Validate against schema using the chosen adapter
    const validationResult = _validateEnvironment(adapter, sourceForValidation);

    // 7. Handle validation outcome
    if (!validationResult.success) {
      const errorMessage = _formatValidationError(validationResult.error);
      console.error(errorMessage); // Log details
      // Throw an error to cause the promise rejection
      throw new Error("Environment validation failed. Check console output.");
    }

    // Resolve the promise with the strongly typed parsed data
    return validationResult.data;
  } catch (error) {
    // Catch errors from _fetchSecrets or validation fail above
    if (error instanceof Error) {
      return Promise.reject(error);
    } else {
      // Wrap non-Error throws/rejections
      return Promise.reject(
        new Error(`An unexpected error occurred: ${String(error)}`)
      );
    }
  }
}
