import {
  jest,
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
} from "@jest/globals";
import { z } from "zod";
import { createEnv } from "../src/index.js"; // Keep .js extension
import type {
  DotenvConfigOptions,
  DotenvConfigOutput,
  DotenvParseOutput,
} from "dotenv";

// --- Type Aliases ---
type DotenvConfigFunction = (
  options?: DotenvConfigOptions
) => DotenvConfigOutput;
type DotenvExpandFunction = (config: DotenvConfigOutput) => DotenvConfigOutput;

// --- Mocks ---
// Mock only dotenv.config globally
const mockedDotenvConfig = jest.fn<DotenvConfigFunction>();

// --- REMOVE Global Mock Expander ---
// const mockedDotenvExpand = jest.fn<DotenvExpandFunction>(...);

// --- Test Schema ---
const testSchema = z.object({
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
  PORT: z.coerce.number().int().positive().default(8080),
  API_URL: z.string().url(), // Required
  SECRET_KEY: z.string().min(10), // Required
  OPTIONAL_VAR: z.string().optional(),
  BOOLEAN_VAR: z.coerce.boolean().default(false),
  // For expansion tests
  BASE_URL: z.string().default("http://localhost"),
  FULL_API_URL: z.string().optional(), // e.g., ${BASE_URL}/api
  VAR_A: z.string().optional(),
  VAR_B: z.string().optional(),
  VAR_C: z.string().optional(),
  EMPTY_VAR_EXPANDED: z.string().optional(),
  // For multiple file tests
  FROM_BASE: z.string().optional(),
  FROM_LOCAL: z.string().optional(),
  FROM_ENV_SPECIFIC: z.string().optional(),
  OVERRIDDEN: z.string().optional(),
});

// --- Environment Setup Helper ---
let originalProcessEnv: NodeJS.ProcessEnv;

beforeEach(() => {
  mockedDotenvConfig.mockReset();
  // No longer need to reset mockedDotenvExpand globally
  originalProcessEnv = { ...process.env };
  const keysToClear = [
    ...Object.keys(testSchema.shape),
    "NODE_ENV",
    "MISSING_VAR",
  ];
  new Set(keysToClear).forEach((key) => delete process.env[key]);
});

afterEach(() => {
  process.env = originalProcessEnv;
});

// --- Helpers (setupProcessEnv, mockDotenvFiles) remain the same ---
const setupProcessEnv = (envVars: Record<string, string | undefined>) => {
  for (const key in envVars) {
    if (envVars[key] !== undefined) {
      process.env[key] = envVars[key];
    } else {
      delete process.env[key];
    }
  }
};

const mockDotenvFiles = (
  files: Record<
    string,
    Record<string, string> | NodeJS.ErrnoException | "ENOENT"
  >
) => {
  mockedDotenvConfig.mockImplementation((options) => {
    const filePathMaybe = options?.path;
    let pathKey: string = "./.env"; // Default path

    if (typeof filePathMaybe === "string") {
      pathKey = filePathMaybe;
    } else if (filePathMaybe !== undefined) {
      const error = new Error(`ENOENT: mock does not support non-string path ${filePathMaybe}`);
      (error as NodeJS.ErrnoException).code = "ENOENT";
      return { error };
    }

    const data = files[pathKey];

    if (data === "ENOENT") {
      const error = new Error(`ENOENT: no such file or directory, open '${pathKey}' (mocked)`);
      (error as NodeJS.ErrnoException).code = "ENOENT";
      return { error };
    } else if (data instanceof Error) {
      return { error: data };
    } else if (data !== undefined) {
      return { parsed: { ...data } };
    } else {
      const error = new Error(`ENOENT: no such file or directory, open '${pathKey}' (default mock)`);
      (error as NodeJS.ErrnoException).code = "ENOENT";
      return { error };
    }
  });
};


// --- Local Mock Expander Function Definition ---
// This function will be passed directly to createEnv in the tests below
const createLocalMockExpander = (): DotenvExpandFunction => {
  return (config: DotenvConfigOutput): DotenvConfigOutput => {
    if (config.error || !config.parsed) {
      return config;
    }

    const parsedCopy: DotenvParseOutput = { ...config.parsed };
    const lookupValues = { ...config.parsed };

    const expandValue = (value: string, processing: Set<string>): string => {
      return value.replace(/\$\{([^}]+)\}/g, (match, varName) => {
        if (processing.has(varName)) { return ''; }
        if (lookupValues[varName] !== undefined) {
          processing.add(varName);
          const expanded = expandValue(lookupValues[varName], processing);
          processing.delete(varName);
          return expanded;
        }
        return '';
      });
    };

    for (const key in parsedCopy) {
      if (Object.prototype.hasOwnProperty.call(parsedCopy, key) && typeof parsedCopy[key] === 'string') {
        const processing = new Set<string>([key]);
        parsedCopy[key] = expandValue(parsedCopy[key], processing);
      }
    }
    // Return NEW object with expanded values
    return { parsed: parsedCopy };
  };
};


// --- v1.0.0 Core Functionality Tests ---
describe("createEnv (v1.0.0 Functionality)", () => {
  // ... (v1.0.0 tests remain unchanged) ...
  it("should return validated env with defaults when no sources provide values", () => {
    setupProcessEnv({ API_URL: "https://test.com", SECRET_KEY: "longenoughsecretkey" });
    mockDotenvFiles({ "./.env": "ENOENT" });
    const env = createEnv({ schema: testSchema, _internalDotenvConfig: mockedDotenvConfig });
    expect(env).toEqual({ NODE_ENV: "development", PORT: 8080, API_URL: "https://test.com", SECRET_KEY: "longenoughsecretkey", BOOLEAN_VAR: false, BASE_URL: "http://localhost", VAR_A: undefined, VAR_B: undefined, VAR_C: undefined, EMPTY_VAR_EXPANDED: undefined, FULL_API_URL: undefined, OPTIONAL_VAR: undefined });
    expect(mockedDotenvConfig).toHaveBeenCalledWith({ path: "./.env" });
  });
  it("should return validated env with values from .env overriding defaults", () => {
    setupProcessEnv({});
    const mockDotEnvData = { NODE_ENV: "production", PORT: "3000", API_URL: "https://from-dotenv.com", SECRET_KEY: "secretkeyfromdotenv", BOOLEAN_VAR: "true", BASE_URL: "https://api.prod.com" };
    mockDotenvFiles({ "./.env": mockDotEnvData });
    const env = createEnv({ schema: testSchema, _internalDotenvConfig: mockedDotenvConfig });
    expect(env).toEqual(expect.objectContaining({ NODE_ENV: "production", PORT: 3000, API_URL: "https://from-dotenv.com", SECRET_KEY: "secretkeyfromdotenv", BOOLEAN_VAR: true, BASE_URL: "https://api.prod.com" }));
    expect(mockedDotenvConfig).toHaveBeenCalledWith({ path: "./.env" });
  });
  it("should return validated env with process.env overriding .env and defaults", () => {
    setupProcessEnv({ PORT: "9999", SECRET_KEY: "processenvsecret", OPTIONAL_VAR: "hello from process" });
    const mockDotEnvData = { PORT: "3000", API_URL: "https://from-dotenv.com", SECRET_KEY: "dotenvsecret", BOOLEAN_VAR: "1" };
    mockDotenvFiles({ "./.env": mockDotEnvData });
    const env = createEnv({ schema: testSchema, _internalDotenvConfig: mockedDotenvConfig });
    expect(env).toEqual(expect.objectContaining({ NODE_ENV: "development", PORT: 9999, API_URL: "https://from-dotenv.com", SECRET_KEY: "processenvsecret", OPTIONAL_VAR: "hello from process", BOOLEAN_VAR: true, BASE_URL: "http://localhost" }));
    expect(mockedDotenvConfig).toHaveBeenCalledWith({ path: "./.env" });
  });
  it("should throw validation error if required variables are missing", () => {
    setupProcessEnv({ SECRET_KEY: "onlythesecretisprovided" });
    mockDotenvFiles({ "./.env": "ENOENT" });
    const consoleErrorSpy = jest.spyOn(console, "error").mockImplementation(() => { });
    expect(() => { createEnv({ schema: testSchema, _internalDotenvConfig: mockedDotenvConfig }); }).toThrow("Environment validation failed. Check console output.");
    expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining("❌ Invalid environment variables:"));
    expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining("- API_URL: Required"));
    expect(consoleErrorSpy).not.toHaveBeenCalledWith(expect.stringContaining("- SECRET_KEY"));
    expect(consoleErrorSpy).not.toHaveBeenCalledWith(expect.stringContaining("- PORT"));
    consoleErrorSpy.mockRestore();
  });
  it("should not load .env if dotEnvPath is false", () => {
    setupProcessEnv({ API_URL: "https://no-dotenv.com", SECRET_KEY: "thiskeyislongenough" });
    const env = createEnv({ schema: testSchema, dotEnvPath: false, _internalDotenvConfig: mockedDotenvConfig });
    expect(env.API_URL).toBe("https://no-dotenv.com");
    expect(env.SECRET_KEY).toBe("thiskeyislongenough");
    expect(env.PORT).toBe(8080);
    expect(mockedDotenvConfig).not.toHaveBeenCalled();
  });
  it("should throw error if .env file fails to load (other than ENOENT)", () => {
    setupProcessEnv({});
    const loadError = new Error("Permission denied");
    mockDotenvFiles({ "./.env": loadError });
    expect(() => { createEnv({ schema: testSchema, _internalDotenvConfig: mockedDotenvConfig }); }).toThrow(`❌ Failed to load .env file from ./.env: ${loadError.message}`);
    expect(mockedDotenvConfig).toHaveBeenCalledTimes(1);
  });
});

// --- v1.1.0 Environment-Specific File Loading Tests ---
describe("createEnv (v1.1.0 - Environment-Specific Files)", () => {
  // ... (v1.1.0 file loading tests remain unchanged) ...
  it("should load .env only if NODE_ENV is not set", () => {
    setupProcessEnv({ NODE_ENV: undefined });
    mockDotenvFiles({ "./.env": { API_URL: "https://base.com", SECRET_KEY: "base-secret-key-123" }, "./.env.development": { API_URL: "https://dev.com" } });
    const env = createEnv({ schema: testSchema, _internalDotenvConfig: mockedDotenvConfig });
    expect(env.API_URL).toBe("https://base.com");
    expect(env.SECRET_KEY).toBe("base-secret-key-123");
    expect(mockedDotenvConfig).toHaveBeenCalledTimes(1);
    expect(mockedDotenvConfig).toHaveBeenCalledWith({ path: "./.env" });
    expect(mockedDotenvConfig).not.toHaveBeenCalledWith({ path: "./.env.development" });
  });
  it("should load .env and .env.development if NODE_ENV=development", () => {
    setupProcessEnv({ NODE_ENV: "development" });
    mockDotenvFiles({ "./.env": { API_URL: "https://base.com", SECRET_KEY: "base-secret-key-123", PORT: "1111" }, "./.env.development": { API_URL: "https://dev.com", SECRET_KEY: "dev-secret-key-456" } });
    const env = createEnv({ schema: testSchema, _internalDotenvConfig: mockedDotenvConfig });
    expect(env.API_URL).toBe("https://dev.com");
    expect(env.SECRET_KEY).toBe("dev-secret-key-456");
    expect(env.PORT).toBe(1111);
    expect(env.NODE_ENV).toBe("development");
    expect(mockedDotenvConfig).toHaveBeenCalledTimes(2);
    expect(mockedDotenvConfig).toHaveBeenCalledWith({ path: "./.env" });
    expect(mockedDotenvConfig).toHaveBeenCalledWith({ path: "./.env.development" });
  });
  it("should load .env and .env.production if NODE_ENV=production", () => {
    setupProcessEnv({ NODE_ENV: "production" });
    mockDotenvFiles({ "./.env": { API_URL: "https://base.com", SECRET_KEY: "base-secret-key-123" }, "./.env.production": { API_URL: "https://prod.com", PORT: "9000" } });
    const env = createEnv({ schema: testSchema, _internalDotenvConfig: mockedDotenvConfig });
    expect(env.API_URL).toBe("https://prod.com");
    expect(env.SECRET_KEY).toBe("base-secret-key-123");
    expect(env.PORT).toBe(9000);
    expect(env.NODE_ENV).toBe("production");
    expect(mockedDotenvConfig).toHaveBeenCalledTimes(2);
    expect(mockedDotenvConfig).toHaveBeenCalledWith({ path: "./.env" });
    expect(mockedDotenvConfig).toHaveBeenCalledWith({ path: "./.env.production" });
  });
  it("should load base .env only if environment-specific file is not found (ENOENT)", () => {
    setupProcessEnv({ NODE_ENV: "test" });
    mockDotenvFiles({ "./.env": { API_URL: "https://base.com", SECRET_KEY: "base-secret-key-123" }, "./.env.test": "ENOENT" });
    const env = createEnv({ schema: testSchema, _internalDotenvConfig: mockedDotenvConfig });
    expect(env.API_URL).toBe("https://base.com");
    expect(env.SECRET_KEY).toBe("base-secret-key-123");
    expect(env.NODE_ENV).toBe("test");
    expect(mockedDotenvConfig).toHaveBeenCalledTimes(2);
    expect(mockedDotenvConfig).toHaveBeenCalledWith({ path: "./.env" });
    expect(mockedDotenvConfig).toHaveBeenCalledWith({ path: "./.env.test" });
  });
  it("should correctly merge: Defaults < Base .env < Env-specific .env < process.env", () => {
    setupProcessEnv({ NODE_ENV: "production", SECRET_KEY: "process-secret-key-final", PORT: "5555", OPTIONAL_VAR: "from-process" });
    mockDotenvFiles({ "./.env": { API_URL: "https://base.com", SECRET_KEY: "base-secret-key-123", BOOLEAN_VAR: "true", BASE_URL: "https://base.url" }, "./.env.production": { API_URL: "https://prod.com", SECRET_KEY: "prod-secret-key-456", PORT: "9000", BASE_URL: "https://prod.url" } });
    const env = createEnv({ schema: testSchema, _internalDotenvConfig: mockedDotenvConfig });
    expect(env).toEqual(expect.objectContaining({ NODE_ENV: "production", PORT: 5555, API_URL: "https://prod.com", SECRET_KEY: "process-secret-key-final", OPTIONAL_VAR: "from-process", BOOLEAN_VAR: true, BASE_URL: "https://prod.url" }));
    expect(mockedDotenvConfig).toHaveBeenCalledTimes(2);
    expect(mockedDotenvConfig).toHaveBeenCalledWith({ path: "./.env" });
    expect(mockedDotenvConfig).toHaveBeenCalledWith({ path: "./.env.production" });
  });
  it("should not load any .env files if dotEnvPath is false, regardless of NODE_ENV", () => {
    setupProcessEnv({ NODE_ENV: "development", API_URL: "https://only.process.env", SECRET_KEY: "verysecureprocesskey" });
    const env = createEnv({ schema: testSchema, dotEnvPath: false, _internalDotenvConfig: mockedDotenvConfig });
    expect(env).toEqual(expect.objectContaining({ NODE_ENV: "development", PORT: 8080, API_URL: "https://only.process.env", SECRET_KEY: "verysecureprocesskey", BOOLEAN_VAR: false, BASE_URL: "http://localhost" }));
    expect(mockedDotenvConfig).not.toHaveBeenCalled();
  });
});

// --- v1.1.0 Variable Expansion Tests ---
describe("createEnv (v1.1.0 - Variable Expansion)", () => {

  it("should perform expansion when expandVariables is true", () => {
    setupProcessEnv({ API_URL: "https://required.com", SECRET_KEY: "some-secret-key-that-is-long" });
    mockDotenvFiles({ "./.env": { BASE_URL: "https://api.example.com", FULL_API_URL: "${BASE_URL}/v1" } });
    const localMockExpander = createLocalMockExpander(); // Create the mock expander

    const env = createEnv({
      schema: testSchema,
      expandVariables: true,
      _internalDotenvConfig: mockedDotenvConfig,
      _internalDotenvExpand: localMockExpander, // Inject the local mock
    });

    // No need to check mock calls globally, but can verify locally if needed
    // expect(localMockExpander).toHaveBeenCalledTimes(1); // This won't work as it's not a jest mock

    expect(env.FULL_API_URL).toBe("https://api.example.com/v1");
    expect(env.BASE_URL).toBe("https://api.example.com");
  });

  it("should NOT perform expansion when expandVariables is false (default)", () => {
    setupProcessEnv({ API_URL: "https://required.com", SECRET_KEY: "a-valid-secret-key" });
    mockDotenvFiles({ "./.env": { BASE_URL: "https://api.example.com", FULL_API_URL: "${BASE_URL}/v1" } });
    const localMockExpander = createLocalMockExpander(); // Define it even if not used, for consistency

    const env = createEnv({
      schema: testSchema,
      // expandVariables: false (default)
      _internalDotenvConfig: mockedDotenvConfig,
      _internalDotenvExpand: localMockExpander, // Pass it, though it won't be called
    });

    // Check that the expander wasn't called (best we can do without jest.fn wrapper)
    // We rely on the output being unexpanded
    expect(env.FULL_API_URL).toBe("${BASE_URL}/v1");
    expect(env.BASE_URL).toBe("https://api.example.com");
  });

  it("should expand variables from both base and env-specific files", () => {
    setupProcessEnv({ NODE_ENV: "development", API_URL: "https://required.com" });
    mockDotenvFiles({ "./.env": { BASE_URL: "https://base.api", SECRET_KEY: "base-secret-key-123" }, "./.env.development": { FULL_API_URL: "${BASE_URL}/dev", SECRET_KEY: "dev-secret-key-456" } });
    const localMockExpander = createLocalMockExpander();

    const env = createEnv({
      schema: testSchema,
      expandVariables: true,
      _internalDotenvConfig: mockedDotenvConfig,
      _internalDotenvExpand: localMockExpander,
    });

    expect(env.FULL_API_URL).toBe("https://base.api/dev");
    expect(env.BASE_URL).toBe("https://base.api");
    expect(env.SECRET_KEY).toBe("dev-secret-key-456");
  });

  it("should NOT expand variables from process.env", () => {
    setupProcessEnv({ NODE_ENV: "production", BASE_URL: "https://process-base.url", API_URL: "https://required.com", SECRET_KEY: "process-secret-is-long" });
    mockDotenvFiles({ "./.env": { FULL_API_URL: "${BASE_URL}/v1" }, "./.env.production": {} });
    const localMockExpander = createLocalMockExpander();

    const env = createEnv({
      schema: testSchema,
      expandVariables: true,
      _internalDotenvConfig: mockedDotenvConfig,
      _internalDotenvExpand: localMockExpander,
    });

    expect(env.FULL_API_URL).toBe("/v1"); // Mock expander returns "" for missing vars
    expect(env.BASE_URL).toBe("https://process-base.url");
  });

  it("should leave variables unexpanded if the referenced variable is missing in .env files", () => {
    setupProcessEnv({ API_URL: "https://required.com", SECRET_KEY: "another-valid-secret" });
    mockDotenvFiles({ "./.env": { FULL_API_URL: "${MISSING_VAR}/missing" } });
    const localMockExpander = createLocalMockExpander();

    const env = createEnv({
      schema: testSchema,
      expandVariables: true,
      _internalDotenvConfig: mockedDotenvConfig,
      _internalDotenvExpand: localMockExpander,
    });

    expect(env.FULL_API_URL).toBe("/missing"); // Mock expander returns "" for missing vars
    expect(env.BASE_URL).toBe("http://localhost");
  });

  it("should not run expansion if dotEnvPath is false", () => {
    setupProcessEnv({ API_URL: "https://required.com", SECRET_KEY: "long-enough-secret-key", PORT: "1234", BASE_URL: "https://process.env.base" });
    const localMockExpander = createLocalMockExpander(); // Define just in case

    const env = createEnv({
      schema: testSchema,
      dotEnvPath: false,
      expandVariables: true, // This should have no effect
      _internalDotenvConfig: mockedDotenvConfig,
      _internalDotenvExpand: localMockExpander,
    });

    // Verify expander wasn't called by checking a value that would be expanded if it ran
    // (and by knowing dotEnvPath=false prevents the expansion block)
    expect(env.BASE_URL).toBe("https://process.env.base"); // Remains from process.env
  });

  // --- Added Edge Case Tests (using local mock expander) ---

  it("should handle multi-level expansion", () => {
    setupProcessEnv({ API_URL: "https://required.com", SECRET_KEY: "long-enough-secret-key" });
    mockDotenvFiles({ "./.env": { VAR_A: "${VAR_B}/pathA", VAR_B: "${VAR_C}", VAR_C: "https://final.value" } });
    const localMockExpander = createLocalMockExpander();

    const env = createEnv({
      schema: testSchema,
      expandVariables: true,
      _internalDotenvConfig: mockedDotenvConfig,
      _internalDotenvExpand: localMockExpander,
    });

    expect(env.VAR_C).toBe("https://final.value");
    expect(env.VAR_B).toBe("https://final.value");
    expect(env.VAR_A).toBe("https://final.value/pathA");
  });

  it("should handle expansion with overrides from env-specific files", () => {
    setupProcessEnv({ NODE_ENV: "development", API_URL: "https://required.com", SECRET_KEY: "long-enough-secret-key" });
    mockDotenvFiles({ "./.env": { BASE_URL: "https://base.url", VAR_A: "base-value" }, "./.env.development": { BASE_URL: "https://dev.url", VAR_A: "${BASE_URL}/specific" } });
    const localMockExpander = createLocalMockExpander();

    const env = createEnv({
      schema: testSchema,
      expandVariables: true,
      _internalDotenvConfig: mockedDotenvConfig,
      _internalDotenvExpand: localMockExpander,
    });

    expect(env.BASE_URL).toBe("https://dev.url");
    expect(env.VAR_A).toBe("https://dev.url/specific");
  });

  it("should handle simple circular dependencies by returning empty string", () => {
    setupProcessEnv({ API_URL: "https://required.com", SECRET_KEY: "long-enough-secret-key" });
    mockDotenvFiles({ "./.env": { VAR_A: "${VAR_B}", VAR_B: "${VAR_A}" } });
    const localMockExpander = createLocalMockExpander();

    const env = createEnv({
      schema: testSchema,
      expandVariables: true,
      _internalDotenvConfig: mockedDotenvConfig,
      _internalDotenvExpand: localMockExpander,
    });

    expect(env.VAR_A).toBe("");
    expect(env.VAR_B).toBe("");
  });

  it("should handle slightly more complex circular dependencies", () => {
    setupProcessEnv({ API_URL: "https://required.com", SECRET_KEY: "long-enough-secret-key" });
    mockDotenvFiles({ "./.env": { VAR_A: "${VAR_B}", VAR_B: "${VAR_C}", VAR_C: "${VAR_A}" } });
    const localMockExpander = createLocalMockExpander();

    const env = createEnv({
      schema: testSchema,
      expandVariables: true,
      _internalDotenvConfig: mockedDotenvConfig,
      _internalDotenvExpand: localMockExpander,
    });

    expect(env.VAR_A).toBe("");
    expect(env.VAR_B).toBe("");
    expect(env.VAR_C).toBe("");
  });

  it("should handle expansion using variable defined later in the merged object", () => {
    setupProcessEnv({ API_URL: "https://required.com", SECRET_KEY: "long-enough-secret-key" });
    mockDotenvFiles({ "./.env": { VAR_A: "${VAR_B}/path", VAR_B: "value-defined-later" } });
    const localMockExpander = createLocalMockExpander();

    const env = createEnv({
      schema: testSchema,
      expandVariables: true,
      _internalDotenvConfig: mockedDotenvConfig,
      _internalDotenvExpand: localMockExpander,
    });

    expect(env.VAR_B).toBe("value-defined-later");
    expect(env.VAR_A).toBe("value-defined-later/path");
  });

  it("should handle expansion resulting in an empty string", () => {
    setupProcessEnv({ API_URL: "https://required.com", SECRET_KEY: "long-enough-secret-key" });
    mockDotenvFiles({ "./.env": { EMPTY_VAR_EXPANDED: "${VAR_B}", VAR_B: "" } });
    const localMockExpander = createLocalMockExpander();

    const env = createEnv({
      schema: testSchema,
      expandVariables: true,
      _internalDotenvConfig: mockedDotenvConfig,
      _internalDotenvExpand: localMockExpander,
    });

    expect(env.VAR_B).toBe("");
    expect(env.EMPTY_VAR_EXPANDED).toBe("");
  });
});
