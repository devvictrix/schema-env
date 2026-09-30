// File: tests/zod-compat.test.ts

import {
  jest,
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
} from "@jest/globals";
import { z as z3 } from "zod/v3";
import { z as z4 } from "zod/v4";
import { createEnv, createEnvAsync } from "../src/index.js";

const consoleErrorSpy = jest
  .spyOn(console, "error")
  .mockImplementation(() => {});

const ENV_KEYS = ["ZC_PORT", "ZC_NAME"];

beforeEach(() => {
  consoleErrorSpy.mockClear();
  ENV_KEYS.forEach((key) => delete process.env[key]);
});

afterEach(() => {
  ENV_KEYS.forEach((key) => delete process.env[key]);
});

const flavors = [
  {
    name: "zod 3",
    schema: z3.object({
      ZC_PORT: z3.coerce.number().int().default(3000),
      ZC_NAME: z3.string().min(3),
    }),
    nonObjectSchema: z3.string(),
  },
  {
    name: "zod 4",
    schema: z4.object({
      ZC_PORT: z4.coerce.number().int().default(3000),
      ZC_NAME: z4.string().min(3),
    }),
    nonObjectSchema: z4.string(),
  },
];

describe.each(flavors)(
  "schema built with $name",
  ({ schema, nonObjectSchema }) => {
    it("createEnv returns parsed values with defaults applied", () => {
      process.env.ZC_NAME = "schema-env";

      const env = createEnv({ schema, dotEnvPath: false });

      expect(env).toEqual({ ZC_PORT: 3000, ZC_NAME: "schema-env" });
    });

    it("createEnv reports each invalid variable and throws the standard error", () => {
      process.env.ZC_PORT = "not-a-number";
      process.env.ZC_NAME = "ab";

      expect(() => createEnv({ schema, dotEnvPath: false })).toThrow(
        "Environment validation failed. Check console output."
      );

      const logged = String(consoleErrorSpy.mock.calls[0]?.[0]);
      expect(logged).toContain("❌ Invalid environment variables:");
      expect(logged).toContain("ZC_PORT");
      expect(logged).toContain("ZC_NAME");
    });

    it("createEnv rejects a non-object schema", () => {
      expect(() =>
        createEnv({
          // @ts-expect-error - Testing invalid schema type
          schema: nonObjectSchema,
          dotEnvPath: false,
        })
      ).toThrow(
        "Invalid 'schema' provided. Expected a ZodObject when 'validator' is not used."
      );
    });

    it("createEnvAsync merges secrets and returns parsed values", async () => {
      const env = await createEnvAsync({
        schema,
        dotEnvPath: false,
        secretsSources: [async () => ({ ZC_NAME: "from-secrets" })],
      });

      expect(env).toEqual({ ZC_PORT: 3000, ZC_NAME: "from-secrets" });
    });

    it("createEnvAsync rejects and reports invalid variables", async () => {
      process.env.ZC_NAME = "ab";

      await expect(
        createEnvAsync({ schema, dotEnvPath: false })
      ).rejects.toThrow("Environment validation failed. Check console output.");
      expect(String(consoleErrorSpy.mock.calls[0]?.[0])).toContain("ZC_NAME");
    });
  }
);

describe("type inference", () => {
  it("infers the output type from a zod 3 schema", () => {
    process.env.ZC_NAME = "schema-env";
    const env = createEnv({
      schema: z3.object({
        ZC_PORT: z3.coerce.number().default(3000),
        ZC_NAME: z3.string(),
      }),
      dotEnvPath: false,
    });

    const port: number = env.ZC_PORT;
    const name: string = env.ZC_NAME;
    expect([port, name]).toEqual([3000, "schema-env"]);
  });

  it("infers the output type from a zod 4 schema", () => {
    process.env.ZC_NAME = "schema-env";
    const env = createEnv({
      schema: z4.object({
        ZC_PORT: z4.coerce.number().default(3000),
        ZC_NAME: z4.string(),
      }),
      dotEnvPath: false,
    });

    const port: number = env.ZC_PORT;
    const name: string = env.ZC_NAME;
    expect([port, name]).toEqual([3000, "schema-env"]);
  });
});
