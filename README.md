# schema-env

[![npm version](https://badge.fury.io/js/schema-env.svg)](https://badge.fury.io/js/schema-env)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

> **Type-safe environment variable validation for Node.js using Zod schemas.**

`schema-env` loads variables from your `.env` file and `process.env`, validates them against a Zod schema at startup, and returns a fully typed configuration object.

---

## 🚀 Features

- **Define Once**: Declare all required and optional variables in a single Zod schema, including types, defaults, and custom validation rules.
- **Load Smart**: Automatically merge `.env` file values (optional) with `process.env`.
- **Validate Early**: Fail fast with clear, aggregated error messages if any variable is missing or invalid.
- **Fully Typed**: Returns `z.infer<typeof schema>` for static typing, IntelliSense, and reduced runtime errors.

## 💿 Installation

```bash
# Using npm
npm install schema-env zod dotenv

# Using yarn
yarn add schema-env zod dotenv

# Using pnpm
pnpm add schema-env zod dotenv
```

> **Note:** `zod` and `dotenv` are peer dependencies and must be installed alongside `schema-env`.

## 🛠️ Usage

### 1. Define Your Schema
Create a Zod schema for your environment variables. Use `.default()`, `.optional()`, and coercion methods like `z.coerce.number()` or `z.coerce.boolean()` as needed.

```ts
// src/env-schema.ts
import { z } from 'zod';

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  DATABASE_URL: z.string().url(),
  PORT: z.coerce.number().int().positive().default(3000),
  API_KEY: z.string().min(10),
  ENABLE_FEATURE_X: z.coerce.boolean().default(false),
  // Optional
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).optional(),
});
```

### 2. Create Your Environment Object
Call `createEnv` early in your application entrypoint to load and validate the variables.

```ts
// src/config.ts
import { createEnv } from 'schema-env';
import { envSchema } from './env-schema';

export const env = createEnv({
  schema: envSchema,
  // Optional: Specify a custom .env path
  // dotEnvPath: './config/.env.local',
  // Skip .env loading
  // dotEnvPath: false,
});

console.log('Mode:', env.NODE_ENV);
console.log('DB URL:', env.DATABASE_URL);
console.log('Port:', env.PORT);
if (env.ENABLE_FEATURE_X) console.log('Feature X enabled');
if (env.LOG_LEVEL) console.log('Log level:', env.LOG_LEVEL);
```

### 3. Create a `.env` File (Optional)
Place a `.env` file at the project root (or your custom path) to define environment-specific values.

```dotenv
# .env
DATABASE_URL=postgresql://user:password@host:port/db
API_KEY=supersecretapikey12345
PORT=8080
# NODE_ENV defaults to 'development'
# ENABLE_FEATURE_X defaults to false
LOG_LEVEL=info
```

## 🔄 Environment Variable Precedence
1. **Schema Defaults** (`.default()` in Zod schema)
2. **.env File** (if `dotEnvPath` is not `false`)
3. **process.env** variables

The merged object is then validated against your Zod schema.

## ❗ Error Handling
On validation failure, `createEnv` will:

- Log a detailed error summary to `console.error`.
- Throw an `Error` to halt application startup.

```
❌ Invalid environment variables:
  - DATABASE_URL: Invalid URL
  - API_KEY: Must be at least 10 characters
  - PORT: Expected number, received "abc"
```

## 📚 API

```ts
createEnv<T extends z.ZodObject<any>>(options: {
  schema: T;
  dotEnvPath?: string | false;
}): z.infer<T>
```

| Option      | Type                   | Default   | Description                                    |
| ----------- | ---------------------- | --------- | ---------------------------------------------- |
| `schema`    | `ZodObject`            | required  | Zod schema defining your env variables         |
| `dotEnvPath`| `string \| false`      | `'.env'`  | Path to `.env` file, or `false` to skip loading|

## 🤝 Contributing

Contributions (bug reports, feature requests) are welcome!

## 📄 License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.

