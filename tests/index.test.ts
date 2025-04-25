// tests/index.test.ts

import {
  jest,
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
} from "@jest/globals";
import { z } from "zod";
import { createEnv } from "../src/index";
// ---> ADD TYPE IMPORTS FROM DOTENV <---
import type { DotenvConfigOptions, DotenvConfigOutput } from 'dotenv';

// ---> DEFINE TYPE ALIAS LOCALLY <---
// Define the expected signature for the mock function, matching src/index.ts
type DotenvConfigFunction = (options?: DotenvConfigOptions) => DotenvConfigOutput;

// ---> CREATE A *TYPED* MOCK FUNCTION <---
// This tells TypeScript the expected signature of the mock
const mockedDotenvConfig = jest.fn<DotenvConfigFunction>();

// --- Test Schema (remains the same) ---
const testSchema = z.object({
  NODE_ENV: z.enum(["development", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(8080),
  API_URL: z.string().url(), // Required
  SECRET_KEY: z.string().min(10), // Required
  OPTIONAL_VAR: z.string().optional(),
  BOOLEAN_VAR: z.coerce.boolean().default(false),
});

// --- Environment Setup Helper (remains the same logic) ---
let originalProcessEnv: NodeJS.ProcessEnv;

beforeEach(() => {
  // Reset the standalone mock function before each test
  mockedDotenvConfig.mockReset();
  // Backup original process.env
  originalProcessEnv = { ...process.env };
});

afterEach(() => {
  // Restore original process.env
  process.env = originalProcessEnv;
});

const setupEnvironment = (
  processEnvOverrides: Record<string, string | undefined>
) => {
  const keysToManage = [
    ...Object.keys(testSchema.shape),
    ...Object.keys(processEnvOverrides),
    'NODE_ENV',
  ];
  new Set(keysToManage).forEach(key => {
    delete process.env[key];
  });
  for (const key in processEnvOverrides) {
    if (processEnvOverrides[key] !== undefined) {
      process.env[key] = processEnvOverrides[key];
    }
  }
};

// --- Test Suites (Injection should now type-check correctly) ---
describe("createEnv", () => {

  it("should return validated env with defaults when no sources provide values", () => {
    setupEnvironment({
      API_URL: "https://test.com",
      SECRET_KEY: "longenoughsecretkey",
    });
    const error = new Error("Mock ENOENT Error");
    (error as NodeJS.ErrnoException).code = "ENOENT";
    // Mock return value needs to conform to DotenvConfigOutput
    mockedDotenvConfig.mockReturnValue({ error });

    // ---> NO TYPE ERROR EXPECTED HERE NOW <---
    const env = createEnv({
      schema: testSchema,
      _internalDotenvConfig: mockedDotenvConfig
    });

    expect(env).toEqual({
      NODE_ENV: "development",
      PORT: 8080,
      API_URL: "https://test.com",
      SECRET_KEY: "longenoughsecretkey",
      BOOLEAN_VAR: false,
    });
    expect(mockedDotenvConfig).toHaveBeenCalledTimes(1);
  });

  it("should return validated env with values from .env overriding defaults", () => {
    setupEnvironment({});
    const mockDotEnvData = {
      NODE_ENV: "production",
      PORT: "3000",
      API_URL: "https://from-dotenv.com",
      SECRET_KEY: "secretkeyfromdotenv",
      BOOLEAN_VAR: "true",
    };
    // Mock return value needs to conform to DotenvConfigOutput
    mockedDotenvConfig.mockReturnValue({ parsed: mockDotEnvData });

    // ---> NO TYPE ERROR EXPECTED HERE NOW <---
    const env = createEnv({
      schema: testSchema,
      _internalDotenvConfig: mockedDotenvConfig
    });

    expect(env).toEqual({
      NODE_ENV: "production",
      PORT: 3000,
      API_URL: "https://from-dotenv.com",
      SECRET_KEY: "secretkeyfromdotenv",
      BOOLEAN_VAR: true,
    });
    expect(mockedDotenvConfig).toHaveBeenCalledTimes(1);
  });

  // ... (rest of the test cases remain the same, the injection point
  //      _internalDotenvConfig: mockedDotenvConfig
  //      should now pass type checking in all of them) ...


  it("should return validated env with values from process.env overriding .env and defaults", () => {
    const processOverrides = {
      PORT: "9999",
      SECRET_KEY: "processenvsecret",
      OPTIONAL_VAR: "hello from process",
    };
    setupEnvironment(processOverrides);
    const mockDotEnvData = {
      PORT: "3000",
      API_URL: "https://from-dotenv.com",
      SECRET_KEY: "dotenvsecret",
    };
    mockedDotenvConfig.mockReturnValue({ parsed: mockDotEnvData });

    const env = createEnv({
      schema: testSchema,
      _internalDotenvConfig: mockedDotenvConfig
    });

    expect(env).toEqual({
      NODE_ENV: "development", // Default
      PORT: 9999, // From process.env
      API_URL: "https://from-dotenv.com", // From mock .env
      SECRET_KEY: "processenvsecret", // From process.env
      OPTIONAL_VAR: "hello from process", // From process.env
      BOOLEAN_VAR: false, // Default
    });
    expect(mockedDotenvConfig).toHaveBeenCalledTimes(1);
  });

  it("should handle optional values correctly (present or absent)", () => {
    // Case 1
    setupEnvironment({
      API_URL: "https://test.com",
      SECRET_KEY: "longenoughsecretkey1",
      OPTIONAL_VAR: "is_present",
    });
    mockedDotenvConfig.mockReturnValue({ parsed: {} });
    let env1 = createEnv({ schema: testSchema, _internalDotenvConfig: mockedDotenvConfig });
    expect(env1.OPTIONAL_VAR).toBe("is_present");
    expect(mockedDotenvConfig).toHaveBeenCalledTimes(1);

    mockedDotenvConfig.mockClear();

    // Case 2
    setupEnvironment({
      API_URL: "https://test.com",
      SECRET_KEY: "longenoughsecretkey2",
    });
    mockedDotenvConfig.mockReturnValue({ parsed: {} });
    let env2 = createEnv({ schema: testSchema, _internalDotenvConfig: mockedDotenvConfig });
    expect(env2.OPTIONAL_VAR).toBeUndefined();
    expect(mockedDotenvConfig).toHaveBeenCalledTimes(1);
  });

  it("should throw validation error if required variables are missing", () => {
    setupEnvironment({
      SECRET_KEY: "onlythesecretisprovided",
    });
    mockedDotenvConfig.mockReturnValue({ parsed: {} });

    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => { });

    expect(() => {
      createEnv({ schema: testSchema, _internalDotenvConfig: mockedDotenvConfig });
    }).toThrow("Environment validation failed. Check console output.");

    expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
    expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining("❌ Invalid environment variables:"));
    expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining("- API_URL: Required"));
    expect(consoleErrorSpy).not.toHaveBeenCalledWith(expect.stringContaining("- SECRET_KEY"));
    consoleErrorSpy.mockRestore();
    expect(mockedDotenvConfig).toHaveBeenCalledTimes(1);
  });

  it("should throw validation error for incorrect types", () => {
    setupEnvironment({});
    mockedDotenvConfig.mockReturnValue({
      parsed: {
        API_URL: "https://valid.url/api",
        SECRET_KEY: "aValidSecretKey123",
        PORT: "not-a-number",
      }
    });

    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => { });

    expect(() => {
      createEnv({ schema: testSchema, _internalDotenvConfig: mockedDotenvConfig });
    }).toThrow("Environment validation failed. Check console output.");

    expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
    expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining("❌ Invalid environment variables:"));
    // The actual error message might vary slightly based on Zod version, but it relates to PORT
    // Let's check for the key rather than the exact message for robustness
    expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining("- PORT:"));
    // If specific message is needed:
    // expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining("Expected number, received nan"));
    consoleErrorSpy.mockRestore();
    expect(mockedDotenvConfig).toHaveBeenCalledTimes(1);
  });

  it("should throw error if .env file fails to load (other than ENOENT)", () => {
    setupEnvironment({
      API_URL: "https://test.com",
      SECRET_KEY: "longenoughsecretkey",
    });
    const loadError = new Error("Permission denied");
    mockedDotenvConfig.mockReturnValue({ error: loadError });

    expect(() => {
      createEnv({ schema: testSchema, _internalDotenvConfig: mockedDotenvConfig });
    }).toThrow(`❌ Failed to load .env file from ./.env: ${loadError.message}`);

    expect(mockedDotenvConfig).toHaveBeenCalledTimes(1);
  });

  it("should not load .env if dotEnvPath is false", () => {
    setupEnvironment({
      API_URL: "https://no-dotenv.com",
      SECRET_KEY: "thiskeyislongenough",
    });

    const env = createEnv({
      schema: testSchema,
      dotEnvPath: false,
      _internalDotenvConfig: mockedDotenvConfig // Provide mock, but it shouldn't be called
    });

    expect(env.API_URL).toBe("https://no-dotenv.com");
    expect(mockedDotenvConfig).not.toHaveBeenCalled();
  });
});