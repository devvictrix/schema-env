# schema-env

[![npm version](https://badge.fury.io/js/schema-env.svg)](https://badge.fury.io/js/schema-env)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Type-safe environment variable validation for Node.js using Zod schemas. Load `.env` files (including environment-specific ones), validate against your schema, leverage Zod's coercion, perform optional variable expansion, and get a fully typed environment object for your application startup.

**Ensures your application starts with a valid and typed environment, catching errors early.**

---

## Features

- ✅ **Type-Safe:** Uses your Zod schema to infer the return type.
- ✅ **Validation:** Ensures required variables are present and correctly typed using Zod.
- ✅ **Coercion:** Leverages Zod's coercion (e.g., strings to numbers/booleans).
- ✅ **`.env` Loading:** Automatically loads variables from `.env` files.
- ✅ **Environment-Specific Files:** Supports `.env.${NODE_ENV}` files (e.g., `.env.development`, `.env.production`). (v1.1.0+)
- ✅ **Variable Expansion:** Optionally expands variables like `${VAR}` using `dotenv-expand`. (v1.1.0+)
- ✅ **Clear Errors:** Reports all validation errors clearly before throwing.
- ✅ **Standard Precedence:** Merges defaults, `.env` files, and `process.env` predictably.
- ✅ **Zero Dependencies (Runtime):** Relies only on `dotenv`, `dotenv-expand`, and `zod`.

---

## Installation

```bash
npm install schema-env zod dotenv dotenv-expand
# or
yarn add schema-env zod dotenv dotenv-expand
# or
pnpm add schema-env zod dotenv dotenv-expand
```

> **Note:** `zod` is a required peer dependency. `dotenv` and `dotenv-expand` are direct dependencies used internally but are commonly installed in projects using `.env` files.

---

## Usage

### 1. Define Your Schema

Create a Zod object schema for your environment variables. Use `.default()` for optional values and Zod's coercion (`z.coerce.*`) where needed.

```typescript
// src/envSchema.ts
import { z } from "zod";

export const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  DATABASE_URL: z.string().url(),
  PORT: z.coerce.number().int().positive().default(3000),
  ENABLE_FEATURE_X: z.coerce.boolean().default(false),
  API_TIMEOUT_MS: z.coerce.number().optional(),
  API_BASE_URL: z.string().url().default("https://api.example.com"),
  FULL_API_ENDPOINT: z.string().url().optional(),
});

// Infer the type for type safety
export type Env = z.infer<typeof envSchema>;
```

### 2. Create `.env` Files (Optional)

Place your environment variables in `.env` files:

- **.env** (base configuration, loaded in all environments):

```dotenv
DATABASE_URL="postgresql://user:password@db.local:5432/mydb"
API_TIMEOUT_MS=5000
API_BASE_URL="https://api.dev.example.com"
FULL_API_ENDPOINT="${API_BASE_URL}/v1/users"
```

- **.env.development** (for `NODE_ENV=development`)
- **.env.production** (for `NODE_ENV=production`):

```dotenv
# .env.production
DATABASE_URL="postgresql://prod_user:prod_pass@db.prod:5432/prod_db"
ENABLE_FEATURE_X=true
API_BASE_URL="https://api.prod.example.com"
# Note: FULL_API_ENDPOINT expands using the production API_BASE_URL
```

### 3. Initialize at Startup

Call `createEnv` early in your application's entry point.

```typescript
// src/index.ts
import { createEnv } from "schema-env";
import { envSchema } from "./envSchema.js";

const env = createEnv({
  schema: envSchema,
  expandVariables: true,      // defaults to false
  // dotEnvPath: './config/.env.base', // custom path
  // dotEnvPath: false,               // disable .env loading
});

console.log("Running in", env.NODE_ENV, "mode on port", env.PORT);
console.log("Database URL:", env.DATABASE_URL);
console.log("Feature X enabled:", env.ENABLE_FEATURE_X);
if (env.API_TIMEOUT_MS) {
  console.log("API Timeout:", env.API_TIMEOUT_MS);
}
console.log("Full API Endpoint:", env.FULL_API_ENDPOINT);
```

---

## API

### `createEnv<T extends ZodSchema>(options: CreateEnvOptions<T>): z.infer<T>`

Main function to validate and parse your environment.

- `schema`: Your Zod object schema (`z.object({...})`).
- `dotEnvPath?`: Path to the base `.env` file (default: `./.env`). Set to `false` to disable loading.
- `expandVariables?`: If `true`, performs variable expansion on `.env` values before merging. Defaults to `false` (v1.1.0+).

### Loading and Merging Precedence (v1.1.0+)

1. Defaults from Zod schema (`.default()`).
2. Base `.env` file.
3. Environment-specific `.env` file (`.env.${NODE_ENV}`).
4. Variable expansion (if enabled).
5. `process.env`.

> **Important:** `schema-env` does not modify `process.env`. Expansion only applies to `.env` files.

### Error Handling

If validation fails, `createEnv`:

- Logs detailed errors to `console.error`.
- Throws `Error("Environment validation failed. Check console output.")`.

---

## Examples

See the `examples/` directory for practical patterns:

- `basic`
- `express`
- `expansion`
- `env-specific`
- `schema-patterns`

---

## Contributing

Please see `CONTRIBUTING.md`.

---

## License

MIT

