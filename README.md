# schema-env

[![npm version](https://badge.fury.io/js/schema-env.svg)](https://badge.fury.io/js/schema-env)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Type-safe environment variable validation for Node.js using Zod schemas. Load .env files, merge with process.env, optionally expand variables, and validate against your schema at application startup, ensuring your configuration is correct and type-safe from the beginning.

**Features**

- ✅ **Type Safety:** Uses your Zod schema to infer the type of the resulting environment object.
- ✅ **Validation:** Ensures required environment variables are present and correctly typed (using Zod's validation and coercion).
- ✅ **.env Loading:** Loads variables from .env files (default, environment-specific, or custom paths).
- ✅ **Multiple Files:** Supports loading from an array of .env file paths.
- ✅ **Clear Precedence:** Well-defined and documented variable source merging order.
- ✅ **Variable Expansion:** Optional support for expanding variables within .env files (e.g., `API_URL=${BASE_URL}/api`) via dotenv-expand.
- ✅ **Fail-Fast:** Throws a clear, aggregated error on validation failure, preventing startup with invalid configuration.
- ✅ **No process.env Mutation:** Does not modify the global process.env object.

---

## Installation

```bash
npm install schema-env zod
# or
yarn add schema-env zod
# or
pnpm add schema-env zod
```

> **Note:** Zod is a peer dependency and must be installed alongside schema-env.

## Usage

### 1. Define Your Schema

Create a file (e.g., `src/env.ts`) and define your Zod schema:

```ts
import { z } from "zod";

export const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  API_URL: z.string().url("Invalid API URL"),
  PORT: z.coerce.number().int().positive().default(3000),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).optional(),
  ENABLE_FEATURE_X: z.coerce.boolean().default(false),
});

export type Env = z.infer<typeof envSchema>;
```

### 2. Validate Environment at Startup

Call `createEnv` early in your application's entry point (e.g., `src/index.ts`):

```ts
import { createEnv } from "schema-env";
import { envSchema, Env } from "./env.js"; // Use .js extension for ESM compatibility

let env: Env;

try {
  env = createEnv({ schema: envSchema });
  console.log("✅ Environment variables validated successfully!");
  console.log(`Running in ${env.NODE_ENV} mode on port ${env.PORT}`);
} catch (error) {
  console.error("❌ Failed to initialize environment:", error);
  process.exit(1);
}

// Your application logic here...
```

### 3. Create a .env File (Optional)

Place environment variables in a `.env` file in your project root:

```dotenv
API_URL=https://api.production.com
PORT=8080
ENABLE_FEATURE_X=true
```

## API

### `createEnv`

```ts
createEnv<T extends ZodSchema>(options: CreateEnvOptions<T>): z.infer<T>
```

The main function to validate and load environment variables.

### CreateEnvOptions

- `schema` (T, required): The Zod object schema (`z.object({...})`) that defines your expected environment variables, their types, and defaults.
- `dotEnvPath` (`string | false | string[]`, optional): Specifies which .env file(s) to load.
  - Default: `undefined` (loads `./.env` by default).
  - `string`: A specific path to a single .env file.
  - `string[]`: An array of file paths (loaded in order, later files override earlier ones).
  - `false`: Disables loading of all .env files (only `process.env` and schema defaults used).
- `expandVariables` (`boolean`, optional): Default: `false`. If `true`, expands variables within .env files using `dotenv-expand`.

## Loading Behavior & Precedence

1. **process.env**: Highest priority; environment variables set directly in the shell override all others.
2. **Environment-Specific File**: If `process.env.NODE_ENV` is set (e.g., `production`) and `dotEnvPath` is not `false`, loads `./.env.${NODE_ENV}`.
3. **Specified .env Files**: Loads the file(s) specified by `dotEnvPath` (later files override earlier ones).
4. **Schema Defaults**: Zod schema defaults (`.default()`) apply only if no value is provided by higher-priority sources.

## Error Handling

- Missing `.env` file paths (ENOENT) are skipped silently.
- Permission errors when reading `.env` files will throw an error.
- Validation failures produce a clear, aggregated error message and halt application startup.

## Examples

See the [examples](./examples) directory for practical usage patterns:

- `examples/basic`: Minimal setup.
- `examples/express`: Integration with an Express.js server.

## Contributing

Contributions are welcome! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

