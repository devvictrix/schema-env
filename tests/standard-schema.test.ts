// File: tests/standard-schema.test.ts

import {
  jest,
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
} from "@jest/globals";
import * as v from "valibot";
import { type } from "arktype";
import { createEnv, createEnvAsync } from "../src/index.js";

const consoleErrorSpy = jest
  .spyOn(console, "error")
  .mockImplementation(() => {});

const ENV_KEYS = ["ZS_PORT", "ZS_NAME"];

beforeEach(() => {
  consoleErrorSpy.mockClear();
  ENV_KEYS.forEach((key) => delete process.env[key]);
});

afterEach(() => {
  ENV_KEYS.forEach((key) => delete process.env[key]);
});

const valibotSchema = v.object({
  ZS_PORT: v.optional(v.string(), "3000"),
  ZS_NAME: v.pipe(v.string(), v.minLength(3)),
});

const arktypeSchema = type({
  ZS_NAME: "string >= 3",
});

describe("valibot schema", () => {
  it("createEnv returns parsed values with defaults applied", () => {
    process.env.ZS_NAME = "schema-env";

    const env = createEnv({ schema: valibotSchema, dotEnvPath: false });

    expect(env).toEqual({ ZS_PORT: "3000", ZS_NAME: "schema-env" });
  });

  it("createEnv reports invalid variables and throws the standard error", () => {
    process.env.ZS_NAME = "ab";

    expect(() =>
      createEnv({ schema: valibotSchema, dotEnvPath: false })
    ).toThrow("Environment validation failed. Check console output.");

    const logged = String(consoleErrorSpy.mock.calls[0]?.[0]);
    expect(logged).toContain("❌ Invalid environment variables:");
    expect(logged).toContain("ZS_NAME:");
  });

  it("createEnvAsync merges secrets and returns parsed values", async () => {
    const env = await createEnvAsync({
      schema: valibotSchema,
      dotEnvPath: false,
      secretsSources: [async () => ({ ZS_NAME: "from-secrets" })],
    });

    expect(env).toEqual({ ZS_PORT: "3000", ZS_NAME: "from-secrets" });
  });

  it("infers the output type", () => {
    process.env.ZS_NAME = "schema-env";
    const env = createEnv({ schema: valibotSchema, dotEnvPath: false });

    const port: string = env.ZS_PORT;
    const name: string = env.ZS_NAME;
    // @ts-expect-error - keys outside the schema are not part of the result type
    expect(env.ZS_UNDECLARED).toBeUndefined();
    expect([port, name]).toEqual(["3000", "schema-env"]);
  });
});

describe("async valibot schema", () => {
  const asyncSchema = v.objectAsync({
    ZS_NAME: v.pipeAsync(
      v.string(),
      v.checkAsync(async (name) => name.length >= 3, "Too short")
    ),
  });

  it("createEnvAsync awaits the validation", async () => {
    process.env.ZS_NAME = "schema-env";

    const env = await createEnvAsync({
      schema: asyncSchema,
      dotEnvPath: false,
    });

    expect(env).toEqual({ ZS_NAME: "schema-env" });
  });

  it("createEnvAsync rejects with reported issues", async () => {
    process.env.ZS_NAME = "ab";

    await expect(
      createEnvAsync({ schema: asyncSchema, dotEnvPath: false })
    ).rejects.toThrow("Environment validation failed. Check console output.");
    expect(String(consoleErrorSpy.mock.calls[0]?.[0])).toContain(
      "ZS_NAME: Too short"
    );
  });

  it("createEnv refuses an asynchronous schema", () => {
    process.env.ZS_NAME = "schema-env";

    expect(() => createEnv({ schema: asyncSchema, dotEnvPath: false })).toThrow(
      "Schema validation is asynchronous. Use createEnvAsync instead."
    );
  });
});

describe("arktype schema", () => {
  it("createEnv returns parsed values", () => {
    process.env.ZS_NAME = "schema-env";

    const env = createEnv({ schema: arktypeSchema, dotEnvPath: false });

    const name: string = env.ZS_NAME;
    expect(name).toBe("schema-env");
  });

  it("createEnv reports invalid variables and throws the standard error", () => {
    process.env.ZS_NAME = "ab";

    expect(() =>
      createEnv({ schema: arktypeSchema, dotEnvPath: false })
    ).toThrow("Environment validation failed. Check console output.");
    expect(String(consoleErrorSpy.mock.calls[0]?.[0])).toContain("ZS_NAME:");
  });
});

describe("invalid schema option", () => {
  it("rejects a value that is neither a Zod object nor a Standard Schema", () => {
    expect(() =>
      createEnv({
        // @ts-expect-error - Testing invalid schema type
        schema: { ZS_NAME: "string" },
        dotEnvPath: false,
      })
    ).toThrow(
      "Invalid 'schema' provided. Expected a ZodObject or a Standard Schema when 'validator' is not used."
    );
  });

  it("rejects a Standard Schema whose output is not an object at compile time", () => {
    expect(() =>
      createEnv({
        // @ts-expect-error - The schema must describe an object of variables
        schema: v.string(),
        dotEnvPath: false,
      })
    ).toThrow("Environment validation failed. Check console output.");
  });
});
