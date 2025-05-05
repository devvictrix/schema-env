<p align="center">
  <a href="https://www.npmjs.com/package/schema-env">
    <img src="https://img.shields.io/npm/v/schema-env.svg" alt="npm version" />
  </a>
  <a href="https://img.shields.io/npm/dm/schema-env.svg">
    <img src="https://img.shields.io/npm/dm/schema-env.svg" alt="Downloads per month" />
  </a>
  <a href="https://opensource.org/licenses/MIT">
    <img src="https://img.shields.io/badge/license-MIT-green.svg" alt="License: MIT" />
  </a>
  <!-- TODO: Update coverage badge dynamically if possible -->
  <img src="https://img.shields.io/badge/coverage-90%2B%25-brightgreen.svg" alt="Coverage Target" />
  <img src="https://img.shields.io/badge/types-TypeScript-blue.svg" alt="TypeScript Support" />
</p>

> **TL;DR** Stop booting your app with missing/invalid env vars. `schema-env` validates them _before_ your code runs and gives you a fully-typed object to consume.

---

## ✨ DX Highlights

- **Fully type-safe** – Zod schema ➜ inferred TS types (or specify your own with adapters).
- **Fail-fast** – throw on first mis-configuration (sync) or reject (async).
- **Zero-magic loading** – predictable precedence & opt-in variable expansion.
- **Secrets-ready** – `createEnvAsync` fetches from Vault, AWS Secrets Manager, etc.
- **Adapter-friendly** – Plug in Joi, Yup, or custom validators easily.
- **Tiny footprint** – only `dotenv`, `dotenv-expand` (runtime) + peer `zod` (optional with adapters).

---

## Installation

```bash
# pick your favourite package manager
npm i schema-env zod dotenv dotenv-expand   # npm
# yarn add schema-env zod dotenv dotenv-expand
# pnpm add schema-env zod dotenv dotenv-expand
```

> **Peer dep notice** — `zod` is declared as a _peer_ dependency. It's required if you use the default `schema` option. You might not need it if you _only_ use the custom `validator` option, but installing it is generally safe. `dotenv` and `dotenv-expand` are direct dependencies.

---

## Quick Start (60 sec)

```ts title="src/env.ts"
// Define schema using Zod (default)
import { z } from "zod";

export const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().url(),
  API_KEY: z.string().min(10),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
});
export type Env = z.infer<typeof envSchema>;
```

```dotenv title=".env"
DATABASE_URL=postgresql://user:password@host:5432/db
API_KEY=super‑secret‑api‑key
PORT=8080
```

```ts title="src/index.ts"
import { createEnv } from "schema-env";
import { envSchema, type Env } from "./env.js";

// Validate using Zod schema
const env: Env = createEnv({ schema: envSchema });

console.info(`Running in ${env.NODE_ENV} mode on :${env.PORT}`);
// Use the typed 'env' object...
```

That’s it – your app will **exit immediately** with a helpful error report if anything is missing or malformed according to your schema.

---

## Secrets? Use `createEnvAsync`

Fetches secrets from external sources _concurrently_ before validation.

<details>
<summary>Example (click to expand)</summary>

```ts
import { createEnvAsync, SecretSourceFunction } from "schema-env";
import { z } from "zod"; // Assuming Zod schema for this example

const schema = z.object({
  NODE_ENV: z.enum(["development", "production"]).default("development"),
  DB_PASSWORD: z.string(),
  STRIPE_KEY: z.string().startsWith("sk_"),
});

// Mock fetching functions (replace with your actual SDK calls)
const fromAws: SecretSourceFunction = async () => {
  console.log("Fetching from AWS...");
  await new Promise((res) => setTimeout(res, 50));
  return { DB_PASSWORD: "aws‑pwd" };
};
const fromVault: SecretSourceFunction = async () => {
  console.log("Fetching from Vault...");
  await new Promise((res) => setTimeout(res, 30));
  return { STRIPE_KEY: "sk_test_123" };
};

(async () => {
  try {
    const env = await createEnvAsync({
      schema,
      secretsSources: [fromAws, fromVault],
      // dotEnvPath: '.env', // .env files load before secrets
      // expandVariables: true, // Expansion happens only on .env files
    });
    console.log("Async env validated:", env);
    // Use env...
  } catch (error) {
    console.error("Fatal: Async validation failed.");
    process.exit(1);
  }
})();
```

</details>

---

## Validation Adapters (Use Joi, Yup, etc.)

Prefer another validation library? Provide a custom adapter via the `validator` option.

<details>
<summary>Example using Joi (click to expand)</summary>

**1. Define Joi Schema & TS Type (`env.joi.ts`)**

```ts
import Joi from "joi";

export interface JoiEnv {
  // Define the expected type
  API_HOST: string;
  API_PORT: number;
}

export const joiEnvSchema = Joi.object<JoiEnv, true>({
  // Use Joi's generic
  API_HOST: Joi.string().hostname().required(),
  API_PORT: Joi.number().port().default(8080),
}).options({ abortEarly: false, allowUnknown: true, convert: true });
```

**2. Implement Adapter (`joi-adapter.ts`)**

```ts
import type { ObjectSchema } from "joi";
import type { ValidationResult, ValidatorAdapter } from "schema-env";

export class JoiValidatorAdapter<TResult> implements ValidatorAdapter<TResult> {
  constructor(private schema: ObjectSchema<TResult>) {}

  validate(data: Record<string, unknown>): ValidationResult<TResult> {
    const result = this.schema.validate(data); // Use Joi options defined in schema
    if (!result.error) {
      return { success: true, data: result.value as TResult };
    } else {
      return {
        success: false,
        error: {
          issues: result.error.details.map((d) => ({
            path: d.path,
            message: d.message,
          })),
        },
      };
    }
  }
}
```

**3. Use Adapter (`index.ts`)**

```ts
import { createEnv } from "schema-env";
import { JoiValidatorAdapter } from "./joi-adapter.js";
import { joiEnvSchema, type JoiEnv } from "./env.joi.js";

// Instantiate adapter
const adapter = new JoiValidatorAdapter(joiEnvSchema);

// Validate using the adapter
// Note: Provide <undefined, JoiEnv> generics
const env = createEnv<undefined, JoiEnv>({
  validator: adapter,
  // dotEnvPath: '.env' // Still loads .env files first
});

console.log("Validated with Joi:", env.API_HOST, env.API_PORT);
```

_See full runnable example in `examples/custom-adapter-joi/`._

</details>

---

## API Overview

| Function                  | Sync? | Description                                                                        |
| ------------------------- | ----- | ---------------------------------------------------------------------------------- |
| `createEnv(options)`      | ✅    | Load `.env` → merge → validate (schema or adapter) → return typed config. Throws.  |
| `createEnvAsync(options)` | ❌    | Load `.env` → fetch secrets → merge → validate → return Promise. Rejects on error. |

### Shared `options`

| Option            | Type                          | Default   | Notes                                                           |
| ----------------- | ----------------------------- | --------- | --------------------------------------------------------------- |
| `schema`          | `z.AnyZodObject`              | —         | **Required** if `validator` not used. Inferred result type.     |
| `validator`       | `ValidatorAdapter<TResult>`   | —         | **Required** if `schema` not used. Requires explicit `TResult`. |
| `dotEnvPath`      | `string \| string[] \| false` | `".env"`  | Disable with `false`; array = load in order.                    |
| `expandVariables` | `boolean`                     | `false`   | Uses `dotenv-expand` on **.env files only**.                    |
| `logger`          | `SchemaEnvLogger`             | `console` | (Future) Inject custom logger (`{error, warn}`).                |

### Async-only `options`

| Option           | Type                     | Default | Notes                                                    |
| ---------------- | ------------------------ | ------- | -------------------------------------------------------- |
| `secretsSources` | `SecretSourceFunction[]` | `[]`    | Fetched **in parallel**; later sources win on key clash. |

### Key Types & Interfaces

- `ValidatorAdapter<TResult>`: Interface for custom adapters.
- `ValidationResult<TResult>`: Standardized success/error result shape.
- `SecretSourceFunction`: `() => Promise<Record<string, string | undefined>>`.
- `SchemaEnvLogger`: `{ error(msg, ...args); warn(msg, ...args) }`.

_(See TSDoc/source for full details)_

---

## Loading Precedence

1.  **Schema/Adapter defaults** (applied during validation)
2.  **.env files** (`dotEnvPath` files → `.env.${NODE_ENV}`) → optional expansion applied here
3.  **Secrets** (`createEnvAsync` only, merged after .env)
4.  **`process.env`** (highest wins)

---

## Error Handling

- Validation issues ➜ Pretty report via `console.error` (or custom logger) + throw/reject.
- Missing `.env` file (`ENOENT`) ➜ Ignored silently.
- Other file I/O errors ➜ Fatal error (throw/reject).
- Failing `secretsSource` (`createEnvAsync`) ➜ Logs warning (via `console.warn` or custom logger); proceeds unless _all_ sources fail _and_ validation fails.

---

## Examples & Recipes

Browse `/examples` for runnable snippets:

- `examples/basic` – Multiple files & expansion.
- `examples/express` – Plug into an Express server.
- `examples/async-secrets` – Mock secret stores with `createEnvAsync`.
- `examples/custom-adapter-joi` – Using Joi via the `validator` option.

---

## License

[MIT](https://opensource.org/licenses/MIT) – use, modify, profit. ✌️
