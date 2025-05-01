# schema-env

[![npm version](https://badge.fury.io/js/schema-env.svg)](https://badge.fury.io/js/schema-env)
[![Build Status](https://github.com/devvictrix/schema-env/actions/workflows/ci.yml/badge.svg)](https://github.com/devvictrix/schema-env/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Type-safe environment variable validation for Node.js using Zod schemas. Load `.env` files, validate `process.env`, and even fetch secrets from external sources asynchronously at startup. Ensure your application starts with a valid and correctly typed environment configuration.

## Features

- **Type Safety:** Leverage Zod schemas to define and validate environment variables, including type coercion.
- **Standard `.env` Support:** Load variables from default (`.env`), environment-specific (`.env.development`), and custom file paths using `dotenv`.
- **Multiple File Loading:** Load configuration from an array of `.env` files (e.g., base + local overrides).
- **Variable Expansion:** Optionally expand variables within `.env` files (e.g., `DATABASE_URL=${DB_HOST}/${DB_NAME}`) using `dotenv-expand`.
- **Clear Precedence:** Predictable merging order: Schema Defaults < `.env` files < Secrets (async only) < `process.env`.
- **Strict Validation:** Fail-fast design throws an error on validation failure, preventing startup with invalid configuration.
- **Asynchronous Secrets Fetching (v2.0+):** Use `createEnvAsync` to fetch secrets from external systems during initialization.
- **Strong Typing:** Provides a fully typed environment object based on your Zod schema.
- **Minimal Dependencies:** Relies primarily on `dotenv` and `dotenv-expand` (with `zod` as a peer dependency).

## Installation

```bash
npm install schema-env zod dotenv dotenv-expand
# or
yarn add schema-env zod dotenv dotenv-expand
# or
pnpm add schema-env zod dotenv dotenv-expand
```

**Note:** `zod`, `dotenv`, and `dotenv-expand` are required dependencies. `zod` is listed as a peer dependency, so ensure it's installed in your project.

## Quick Start

1.  **Define your schema (`env.ts`):**

    ```typescript
    // src/env.ts
    import { z } from "zod";

    export const envSchema = z.object({
      NODE_ENV: z
        .enum(["development", "production", "test"])
        .default("development"),
      PORT: z.coerce.number().int().positive().default(3000),
      DATABASE_URL: z.string().url(),
      API_KEY: z.string().min(10),
      LOG_LEVEL: z
        .enum(["debug", "info", "warn", "error"])
        .optional()
        .default("info"),
    });

    // Optional: Infer the type for use in your app
    export type Env = z.infer<typeof envSchema>;
    ```

2.  **Create `.env` file:**

    ```dotenv
    # .env
    DATABASE_URL=postgresql://user:password@host:5432/db
    API_KEY=your-super-secret-api-key-here
    PORT=8080
    ```

3.  **Validate at startup (`index.ts`):**

    ```typescript
    // src/index.ts
    import { createEnv } from "schema-env";
    import { envSchema, Env } from "./env.js"; // Use .js in imports for ESM

    let env: Env;

    try {
      env = createEnv({
        schema: envSchema,
        // Other options like dotEnvPath, expandVariables can go here
      });
      console.log("Environment validated successfully!");
    } catch (error) {
      console.error("❌ Environment validation failed:", error);
      process.exit(1);
    }

    // Use the validated and typed `env` object
    console.log(`Running in ${env.NODE_ENV} mode on port ${env.PORT}`);
    // startYourApp(env);
    ```

## API

### `createEnv(options)`

- **Returns:** `z.infer<Schema>` (The typed environment object)
- **Behavior:** Synchronous. Loads, merges, optionally expands, and validates environment variables. Throws an error on validation failure or critical file loading errors.
- **`options`:**
  - `schema: ZodObject`: **Required.** Your Zod object schema defining the environment variables.
  - `dotEnvPath?: string | false | string[]`: Path(s) to `.env` file(s).
    - Default: `'./.env'`
    - `false`: Disable loading all `.env` files.
    - `string`: Path to a single `.env` file.
    - `string[]`: Array of paths. Loaded sequentially, later files override earlier ones.
  - `expandVariables?: boolean`: Enable variable expansion via `dotenv-expand`. Default: `false`. Applies only to values loaded from `.env` files.

## Asynchronous Validation with `createEnvAsync` (v2.0+)

For scenarios where you need to fetch configuration secrets from external systems (like AWS Secrets Manager, HashiCorp Vault, Google Secret Manager, etc.) during startup, `schema-env` provides the `createEnvAsync` function.

```typescript
import { createEnvAsync, SecretSourceFunction } from "schema-env";
import { z } from "zod";
import { fetchFromAWS, fetchFromVault } from "./my-secret-fetchers"; // Your implementations

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production"]).default("development"),
  // Variables from .env or process.env
  PORT: z.coerce.number().default(3000),
  // Variables expected from secrets managers
  DATABASE_PASSWORD: z.string().min(1),
  STRIPE_API_KEY: z.string().startsWith("sk_"),
  // Variable potentially overridden by different sources
  API_ENDPOINT: z.string().url(),
});

// Define functions to fetch secrets. They must return Promise<Record<string, string | undefined>>
const getDbSecrets: SecretSourceFunction = async () => {
  // Replace with your actual SDK call to AWS Secrets Manager, Vault, etc.
  // Handle authentication securely within this function.
  console.log("Fetching DB secrets...");
  await new Promise((res) => setTimeout(res, 50)); // Simulate delay
  // Return undefined for keys not found by this source
  return {
    DATABASE_PASSWORD: "aws-db-password-123",
    API_ENDPOINT: "https://db-secrets.example.com/api",
  };
};

const getPaymentSecrets: SecretSourceFunction = async () => {
  console.log("Fetching Payment secrets...");
  await new Promise((res) => setTimeout(res, 30)); // Simulate delay
  // This source might override API_ENDPOINT from the previous one
  return {
    STRIPE_API_KEY: "sk_test_abcdefg12345",
    API_ENDPOINT: "https://payment-secrets.example.com/api",
  };
};

const failingSource: SecretSourceFunction = async () => {
  console.log("Attempting failing source...");
  await new Promise((_, rej) =>
    setTimeout(() => rej(new Error("Network Error")), 20)
  );
  return {}; // Should not be reached
};

async function initializeApp() {
  try {
    const env = await createEnvAsync({
      schema: envSchema,
      // Optionally load .env files first
      dotEnvPath: [".env.base", ".env.development"],
      expandVariables: false, // Expansion only applies to .env files
      secretsSources: [
        getDbSecrets, // Fetched concurrently
        getPaymentSecrets, // Fetched concurrently
        failingSource, // Errors are caught and logged as warnings
      ],
    });

    // env is fully typed and validated, including secrets
    console.log(`Initialization successful for NODE_ENV=${env.NODE_ENV}`);
    console.log(`Using Port: ${env.PORT}`);
    console.log(`DB Password loaded: ${env.DATABASE_PASSWORD ? "Yes" : "No"}`);
    console.log(`Stripe Key loaded: ${env.STRIPE_API_KEY ? "Yes" : "No"}`);
    console.log(`Final API Endpoint: ${env.API_ENDPOINT}`); // Value from getPaymentSecrets wins

    // Start your application...
    // startServer(env);
  } catch (error) {
    // Validation errors or fatal setup errors cause rejection
    console.error("❌ Application failed to initialize:", error);
    process.exit(1);
  }
}

initializeApp();
```

### `createEnvAsync(options)`

- **Returns:** `Promise<z.infer<Schema>>`
- **Behavior:** Asynchronous. Loads `.env` files, fetches secrets, merges sources, validates against the schema. Resolves with the validated environment object on success, rejects on validation failure or fatal setup errors (like non-ENOENT file load errors).
- **Options:** Accepts the same options as `createEnv`, plus:
  - `secretsSources?: SecretSourceFunction[]`: An array of asynchronous functions. Each function must:
    - Take no arguments.
    - Return a `Promise<Record<string, string | undefined>>`. The resolved record should contain the fetched secret names and their string values. Use `undefined` for secrets not found by that source.
    - Handle its own authentication and error handling internally. If a source fails (promise rejects or throws), a warning is logged, but `createEnvAsync` continues processing other sources. If _all_ sources fail, a final warning is logged, and validation proceeds with only `.env` and `process.env` data.

## Loading Logic & Precedence

Variables are collected and merged from different sources before validation. The order of precedence determines which value is used if a variable exists in multiple sources.

### `createEnv` (Synchronous) Precedence

1.  **Schema Defaults:** Lowest priority, applied by Zod during parsing if a key is missing or `undefined` in the final merged input.
2.  **`.env` Files:** Loaded according to `dotEnvPath` and `NODE_ENV`.
    - Files in `dotEnvPath` array (later override earlier).
    - Single `dotEnvPath` file.
    - Default `./.env`.
    - Environment-specific file (`.env.${NODE_ENV}`) overrides files above.
    - Variable expansion (`expandVariables: true`) applies to the combined values from _all_ loaded `.env` files at this stage.
3.  **`process.env`:** Highest priority. Values in `process.env` override values from all other sources.

### `createEnvAsync` (Asynchronous) Precedence

1.  **Schema Defaults:** Lowest priority.
2.  **`.env` Files:** Same loading and expansion logic as `createEnv`.
3.  **Secrets Sources:** Values resolved successfully from the functions provided in the `secretsSources` array. If multiple sources provide the same key, the value from the _later_ function in the array takes precedence. Secrets override `.env` files.
4.  **`process.env`:** Highest priority. Overrides values from all other sources, including Secrets Sources.

## Error Handling

If the Zod schema validation fails for `createEnv` or `createEnvAsync`:

1.  A detailed error message listing all validation issues is logged to `console.error`.
2.  `createEnv` throws an `Error`.
3.  `createEnvAsync` rejects the returned `Promise` with an `Error`.

This ensures your application does not start with an invalid environment configuration.

File loading errors (other than a file simply not existing - `ENOENT`) will also cause a synchronous `Error` to be thrown immediately by either function.

Errors within `secretsSources` functions for `createEnvAsync` are logged as warnings, and processing continues unless _all_ sources fail (in which case a final warning is logged before attempting validation with other available sources).

## Examples

See the `/examples` directory for practical usage patterns:

- `/examples/basic`: Demonstrates core features, multiple `.env` files, and expansion.
- `/examples/express`: Shows integration with an Express.js application.
- `/examples/async-secrets`: Demonstrates fetching mock secrets using createEnvAsync and secretsSources.

## License

MIT
