// File: tests/index.test.ts

import {
  jest,
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  afterAll, // Added for potential final mock restore
} from "@jest/globals";
import { z } from "zod";
// Import both functions now
import {
  createEnv,
  createEnvAsync,
  SecretSourceFunction,
} from "../src/index.js"; // Keep .js extension
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
// Mock console methods BEFORE tests run
const consoleErrorSpy = jest
  .spyOn(console, "error")
  .mockImplementation(() => {});
const consoleWarnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});

// Mocks for dependencies, reset before each test
const mockedDotenvConfig = jest.fn<DotenvConfigFunction>();
const mockedDotenvExpand = jest.fn<DotenvExpandFunction>();

// --- Test Schema (Includes vars for async tests) ---
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
  // For async tests
  FROM_SECRET_MANAGER_1: z.string().optional(),
  FROM_SECRET_MANAGER_2: z.string().optional(),
});

// --- Environment Setup Helper ---
let originalProcessEnv: NodeJS.ProcessEnv;

beforeEach(() => {
  // Reset mocks
  mockedDotenvConfig.mockReset();
  mockedDotenvExpand.mockReset(); // Reset expand mock as well
  consoleErrorSpy.mockClear(); // Clear spy calls before each test
  consoleWarnSpy.mockClear();

  // Backup and clear process.env relevant keys
  originalProcessEnv = { ...process.env };
  const keysToClear = [
    ...Object.keys(testSchema.shape),
    "NODE_ENV", // Explicitly clear NODE_ENV too
    "MISSING_VAR", // Any other potential test vars
  ];
  new Set(keysToClear).forEach((key) => delete process.env[key]);

  // Default successful expand behavior (can be overridden per test)
  mockedDotenvExpand.mockImplementation((config) => config);
});

afterEach(() => {
  process.env = originalProcessEnv; // Restore original process.env
});

// Restore console mocks after all tests in this file are done
afterAll(() => {
  consoleErrorSpy.mockRestore();
  consoleWarnSpy.mockRestore();
});

// --- Helpers ---
const setupProcessEnv = (envVars: Record<string, string | undefined>) => {
  for (const key in envVars) {
    if (envVars[key] !== undefined) {
      process.env[key] = envVars[key];
    } else {
      // Explicitly delete if value is undefined
      delete process.env[key];
    }
  }
};

const mockDotenvFiles = (
  files: Record<
    string,
    Record<string, string> | NodeJS.ErrnoException | "ENOENT" | "UNEXPECTED"
  >
) => {
  mockedDotenvConfig.mockImplementation((options) => {
    const filePathMaybe = options?.path;
    // Determine the effective path key based on input
    const pathKey =
      typeof filePathMaybe === "string" ? filePathMaybe : "./.env"; // Default path if options.path is missing

    const data = files[pathKey];

    if (data === "ENOENT") {
      // Simulate ENOENT error
      const error = new Error(
        `ENOENT: no such file or directory, open '${pathKey}' (mocked)`
      );
      (error as NodeJS.ErrnoException).code = "ENOENT";
      return { error };
    } else if (data instanceof Error) {
      // Simulate other specific errors passed in
      return { error: data };
    } else if (data === "UNEXPECTED") {
      // Simulate an unexpected throw *during* config call
      throw new Error(
        `Unexpected internal error in dotenv.config for ${pathKey}`
      );
    } else if (data !== undefined && typeof data === "object") {
      // Return parsed data for successful loads
      return { parsed: { ...data } };
    } else {
      // Default mock behavior: treat unknown paths as ENOENT if not specified
      // console.warn(`Mocking unspecified path ${pathKey} as ENOENT`);
      const error = new Error(
        `ENOENT: no such file or directory, open '${pathKey}' (default mock)`
      );
      (error as NodeJS.ErrnoException).code = "ENOENT";
      return { error };
    }
  });
};

// Use the same mock expander logic as before
const createLocalMockExpander = (): DotenvExpandFunction => {
  return (config: DotenvConfigOutput): DotenvConfigOutput => {
    if (config.error || !config.parsed) {
      return config; // Pass through errors or empty configs
    }
    const parsedCopy: DotenvParseOutput = { ...config.parsed };
    const lookupValues = { ...config.parsed };
    const expandValue = (value: string, processing: Set<string>): string => {
      return value.replace(/\$\{([^}]+)\}/g, (match, varName) => {
        if (processing.has(varName)) {
          return ""; // Circular dependency
        }
        if (lookupValues[varName] !== undefined) {
          processing.add(varName);
          const expanded = expandValue(lookupValues[varName], processing);
          processing.delete(varName);
          return expanded;
        }
        return ""; // Var not found
      });
    };
    for (const key in parsedCopy) {
      if (
        Object.prototype.hasOwnProperty.call(parsedCopy, key) &&
        typeof parsedCopy[key] === "string"
      ) {
        const processing = new Set<string>([key]);
        parsedCopy[key] = expandValue(parsedCopy[key], processing);
      }
    }
    return { parsed: parsedCopy };
  };
};

// --- v1.0.0 Core Functionality Tests (createEnv) ---
describe("createEnv (Synchronous Validation)", () => {
  // Test case modified to remove undefined optional fields from expectation
  it("should return validated env with defaults when no sources provide values", () => {
    setupProcessEnv({
      API_URL: "https://test.com",
      SECRET_KEY: "longenoughsecretkey",
    });
    mockDotenvFiles({}); // No .env file found
    const env = createEnv({
      schema: testSchema,
      _internalDotenvConfig: mockedDotenvConfig,
    });
    // Only expect fields that have defaults or were explicitly provided
    expect(env).toEqual(
      expect.objectContaining({
        NODE_ENV: "development", // Default
        PORT: 8080, // Default
        API_URL: "https://test.com", // From process.env
        SECRET_KEY: "longenoughsecretkey", // From process.env
        BOOLEAN_VAR: false, // Default
        BASE_URL: "http://localhost", // Default
      })
    );
    // Ensure optional fields that were not provided and have no default are NOT present
    expect(env).not.toHaveProperty("OPTIONAL_VAR");
    expect(env).not.toHaveProperty("FULL_API_URL");
    expect(env).not.toHaveProperty("FROM_BASE");
    // Should only attempt to load default .env
    expect(mockedDotenvConfig).toHaveBeenCalledTimes(1);
    expect(mockedDotenvConfig).toHaveBeenCalledWith(
      expect.objectContaining({ path: "./.env" })
    );
  });

  it("should return validated env with values from .env overriding defaults", () => {
    setupProcessEnv({}); // Clear process.env for this test
    const mockDotEnvData = {
      NODE_ENV: "production",
      PORT: "3000",
      API_URL: "https://from-dotenv.com",
      SECRET_KEY: "secretkeyfromdotenv",
      BOOLEAN_VAR: "true",
      BASE_URL: "https://api.prod.com",
    };
    mockDotenvFiles({ "./.env": mockDotEnvData });
    const env = createEnv({
      schema: testSchema,
      _internalDotenvConfig: mockedDotenvConfig,
      _internalDotenvExpand: mockedDotenvExpand, // Provide mock expander
    });
    expect(env).toEqual(
      expect.objectContaining({
        NODE_ENV: "production",
        PORT: 3000,
        API_URL: "https://from-dotenv.com",
        SECRET_KEY: "secretkeyfromdotenv",
        BOOLEAN_VAR: true,
        BASE_URL: "https://api.prod.com", // Overrides default
      })
    );
    expect(mockedDotenvConfig).toHaveBeenCalledWith(
      expect.objectContaining({ path: "./.env" })
    );
    expect(mockedDotenvExpand).not.toHaveBeenCalled(); // Expansion is off by default
  });

  it("should return validated env with process.env overriding .env and defaults", () => {
    setupProcessEnv({
      PORT: "9999", // Override from process.env
      SECRET_KEY: "processenvsecret", // Override from process.env
      OPTIONAL_VAR: "hello from process",
    });
    const mockDotEnvData = {
      PORT: "3000", // Will be overridden by process.env
      API_URL: "https://from-dotenv.com",
      SECRET_KEY: "dotenvsecret", // Will be overridden by process.env
      BOOLEAN_VAR: "1", // Will be used
    };
    mockDotenvFiles({ "./.env": mockDotEnvData });
    const env = createEnv({
      schema: testSchema,
      _internalDotenvConfig: mockedDotenvConfig,
      _internalDotenvExpand: mockedDotenvExpand,
    });
    expect(env).toEqual(
      expect.objectContaining({
        NODE_ENV: "development", // Default, not in .env or process.env
        PORT: 9999, // From process.env
        API_URL: "https://from-dotenv.com", // From .env
        SECRET_KEY: "processenvsecret", // From process.env
        OPTIONAL_VAR: "hello from process", // From process.env
        BOOLEAN_VAR: true, // From .env, coerced
        BASE_URL: "http://localhost", // Default
      })
    );
    expect(mockedDotenvConfig).toHaveBeenCalledWith(
      expect.objectContaining({ path: "./.env" })
    );
    expect(mockedDotenvExpand).not.toHaveBeenCalled(); // Expansion off
  });

  it("should throw validation error if required variables are missing", () => {
    setupProcessEnv({ SECRET_KEY: "onlythesecretisprovided" }); // Missing API_URL
    mockDotenvFiles({}); // No .env file
    expect(() => {
      createEnv({
        schema: testSchema,
        _internalDotenvConfig: mockedDotenvConfig,
        _internalDotenvExpand: mockedDotenvExpand,
      });
    }).toThrow("Environment validation failed. Check console output.");
    // Check console.error was called with specific message details
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining("❌ Invalid environment variables:")
    );
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining("- API_URL: Required") // Correct check for missing required field
    );
    expect(consoleErrorSpy).not.toHaveBeenCalledWith(
      expect.stringContaining("- SECRET_KEY") // SECRET_KEY was provided
    );
  });

  it("should not load any .env files if dotEnvPath is false", () => {
    setupProcessEnv({
      API_URL: "https://no-dotenv.com",
      SECRET_KEY: "thiskeyislongenough",
    });
    // No .env files will be loaded
    mockDotenvFiles({ "./.env": { SHOULD_NOT: "load" } });
    const env = createEnv({
      schema: testSchema,
      dotEnvPath: false, // Disable loading explicitly
      _internalDotenvConfig: mockedDotenvConfig,
      _internalDotenvExpand: mockedDotenvExpand,
    });
    expect(env.API_URL).toBe("https://no-dotenv.com");
    expect(env.SECRET_KEY).toBe("thiskeyislongenough");
    expect(env.PORT).toBe(8080); // Default value
    expect(mockedDotenvConfig).not.toHaveBeenCalled(); // Ensure dotenv.config was never called
    expect(mockedDotenvExpand).not.toHaveBeenCalled(); // Expansion should not be called
  });

  it("should THROW error if .env file fails to load (other than ENOENT)", () => {
    setupProcessEnv({}); // Clear process.env
    const loadError = new Error("Permission denied");
    (loadError as NodeJS.ErrnoException).code = "EACCES"; // Simulate a permission error
    mockDotenvFiles({ "./.env": loadError }); // Mock the error for the default path

    expect(() => {
      createEnv({
        schema: testSchema,
        _internalDotenvConfig: mockedDotenvConfig,
        _internalDotenvExpand: mockedDotenvExpand,
      });
    }).toThrow(
      // Check for the specific error message thrown by the library
      `❌ Failed to load environment file from ./.env: ${loadError.message}`
    );
    expect(mockedDotenvConfig).toHaveBeenCalledWith(
      expect.objectContaining({ path: "./.env" })
    );
    expect(mockedDotenvExpand).not.toHaveBeenCalled(); // Expansion should not be reached
  });

  it("should handle optional variables correctly", () => {
    setupProcessEnv({
      API_URL: "https://required.com",
      SECRET_KEY: "longenoughsecretkey",
      OPTIONAL_VAR: "provided",
    });
    mockDotenvFiles({});
    const env = createEnv({
      schema: testSchema,
      _internalDotenvConfig: mockedDotenvConfig,
      _internalDotenvExpand: mockedDotenvExpand,
    });
    expect(env.OPTIONAL_VAR).toBe("provided");
    expect(env.FULL_API_URL).toBeUndefined(); // Another optional var, not provided
  });

  // --- NEW/MODIFIED Branch Coverage Tests (Core) ---
  it("should THROW if dotenv.config throws an unexpected error during load", () => {
    // Branch: _loadDotEnvFiles -> catch (e) block
    setupProcessEnv({});
    mockDotenvFiles({ "./.env": "UNEXPECTED" }); // Simulate unexpected throw

    expect(() => {
      createEnv({
        schema: testSchema,
        _internalDotenvConfig: mockedDotenvConfig,
        _internalDotenvExpand: mockedDotenvExpand,
      });
    }).toThrow(/Unexpected error during dotenv.config call/);
    expect(mockedDotenvExpand).not.toHaveBeenCalled();
  });

  it("should THROW if schema is not a ZodObject (createEnv)", () => {
    // Branch: createEnv -> !(schema instanceof ZodObject)
    setupProcessEnv({});
    mockDotenvFiles({});
    expect(() => {
      createEnv({
        // @ts-expect-error - Deliberately passing invalid schema type
        schema: z.string(), // Pass a non-object schema
        _internalDotenvConfig: mockedDotenvConfig,
        _internalDotenvExpand: mockedDotenvExpand,
      });
    }).toThrow("Invalid schema provided. Expected a ZodObject.");
    expect(mockedDotenvConfig).not.toHaveBeenCalled();
    expect(mockedDotenvExpand).not.toHaveBeenCalled();
  });
});

// --- v1.2.0 Env-Specific & Expansion Tests (createEnv) ---
describe("createEnv (Env-Specific Files & Expansion)", () => {
  it("should load .env only if NODE_ENV is not set (using default path)", () => {
    // NODE_ENV is cleared in beforeEach
    mockDotenvFiles({
      "./.env": {
        API_URL: "https://base.com",
        SECRET_KEY: "base-secret-key-123",
      },
      // Mock that env-specific doesn't exist or isn't loaded
      "./.env.development": "ENOENT",
      "./.env.production": "ENOENT",
      "./.env.test": "ENOENT",
    });
    const env = createEnv({
      schema: testSchema,
      _internalDotenvConfig: mockedDotenvConfig,
      _internalDotenvExpand: mockedDotenvExpand,
    });
    expect(env.API_URL).toBe("https://base.com");
    expect(env.SECRET_KEY).toBe("base-secret-key-123");
    // Should only attempt to load './.env' as NODE_ENV is unset
    expect(mockedDotenvConfig).toHaveBeenCalledTimes(1);
    expect(mockedDotenvConfig).toHaveBeenCalledWith(
      expect.objectContaining({ path: "./.env" })
    );
    expect(mockedDotenvExpand).not.toHaveBeenCalled(); // Expansion off
  });

  it("should load .env and .env.development if NODE_ENV=development", () => {
    setupProcessEnv({ NODE_ENV: "development" });
    mockDotenvFiles({
      "./.env": {
        API_URL: "https://base.com", // Will be overridden
        SECRET_KEY: "base-secret-key-123", // Will be overridden
        PORT: "1111", // Will be used
      },
      "./.env.development": {
        API_URL: "https://dev.com", // Overrides base
        SECRET_KEY: "dev-secret-key-456", // Overrides base
      },
    });
    const env = createEnv({
      schema: testSchema,
      _internalDotenvConfig: mockedDotenvConfig,
      _internalDotenvExpand: mockedDotenvExpand,
    });
    expect(env.API_URL).toBe("https://dev.com");
    expect(env.SECRET_KEY).toBe("dev-secret-key-456");
    expect(env.PORT).toBe(1111); // From base .env
    expect(env.NODE_ENV).toBe("development"); // From process.env via schema default logic
    // It loads base first, then env-specific
    expect(mockedDotenvConfig).toHaveBeenCalledTimes(2);
    expect(mockedDotenvConfig).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ path: "./.env" })
    );
    expect(mockedDotenvConfig).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ path: "./.env.development" })
    );
    expect(mockedDotenvExpand).not.toHaveBeenCalled(); // Expansion off
  });

  it("should load base .env only if environment-specific file is not found (ENOENT)", () => {
    setupProcessEnv({ NODE_ENV: "test" }); // Set NODE_ENV
    mockDotenvFiles({
      "./.env": {
        API_URL: "https://base.com",
        SECRET_KEY: "base-secret-key-123",
      },
      "./.env.test": "ENOENT", // Mock environment-specific file as not found
    });
    const env = createEnv({
      schema: testSchema,
      _internalDotenvConfig: mockedDotenvConfig,
      _internalDotenvExpand: mockedDotenvExpand,
    });
    // Values should come from the base .env file
    expect(env.API_URL).toBe("https://base.com");
    expect(env.SECRET_KEY).toBe("base-secret-key-123");
    expect(env.NODE_ENV).toBe("test"); // From process.env via schema logic
    // Should attempt to load both files
    expect(mockedDotenvConfig).toHaveBeenCalledTimes(2);
    expect(mockedDotenvConfig).toHaveBeenCalledWith(
      expect.objectContaining({ path: "./.env" })
    );
    expect(mockedDotenvConfig).toHaveBeenCalledWith(
      expect.objectContaining({ path: "./.env.test" })
    );
    expect(mockedDotenvExpand).not.toHaveBeenCalled(); // Expansion off
  });

  it("should correctly merge: Defaults < Base .env < Env-specific .env < process.env (single base path)", () => {
    setupProcessEnv({
      NODE_ENV: "production",
      SECRET_KEY: "process-secret-key-final", // Highest priority
      PORT: "5555", // Highest priority
      OPTIONAL_VAR: "from-process", // Highest priority
    });
    mockDotenvFiles({
      "./.env": {
        API_URL: "https://base.com", // Overridden by env-specific
        SECRET_KEY: "base-secret-key-123", // Overridden by env-specific, then process.env
        BOOLEAN_VAR: "true", // Used
        BASE_URL: "https://base.url", // Overridden by env-specific
        OVERRIDDEN: "from-base", // Overridden by env-specific
      },
      "./.env.production": {
        API_URL: "https://prod.com", // Overrides base
        SECRET_KEY: "prod-secret-key-456", // Overrides base, overridden by process.env
        PORT: "9000", // Overrides base, overridden by process.env
        BASE_URL: "https://prod.url", // Overrides base
        OVERRIDDEN: "from-prod", // Overrides base
      },
    });
    const env = createEnv({
      schema: testSchema,
      _internalDotenvConfig: mockedDotenvConfig,
      _internalDotenvExpand: mockedDotenvExpand,
    });
    expect(env).toEqual(
      expect.objectContaining({
        NODE_ENV: "production", // From process.env via schema
        PORT: 5555, // From process.env
        API_URL: "https://prod.com", // From env-specific
        SECRET_KEY: "process-secret-key-final", // From process.env
        OPTIONAL_VAR: "from-process", // From process.env
        BOOLEAN_VAR: true, // From base .env
        BASE_URL: "https://prod.url", // From env-specific
        OVERRIDDEN: "from-prod", // From env-specific
      })
    );
    expect(mockedDotenvConfig).toHaveBeenCalledTimes(2); // Base and prod files attempted
    expect(mockedDotenvConfig).toHaveBeenCalledWith(
      expect.objectContaining({ path: "./.env" })
    );
    expect(mockedDotenvConfig).toHaveBeenCalledWith(
      expect.objectContaining({ path: "./.env.production" })
    );
    expect(mockedDotenvExpand).not.toHaveBeenCalled(); // Expansion off
  });

  it("should perform expansion when expandVariables is true (single .env)", () => {
    setupProcessEnv({
      API_URL: "https://required.com", // Satisfy schema requirements
      SECRET_KEY: "some-secret-key-that-is-long", // Satisfy schema requirements
    });
    mockDotenvFiles({
      "./.env": {
        BASE_URL: "https://api.example.com",
        FULL_API_URL: "${BASE_URL}/v1", // Needs expansion
      },
    });
    // Override default mockExpand to use the local one
    mockedDotenvExpand.mockImplementation(createLocalMockExpander());
    const env = createEnv({
      schema: testSchema,
      expandVariables: true, // Enable expansion
      _internalDotenvConfig: mockedDotenvConfig,
      _internalDotenvExpand: mockedDotenvExpand, // Inject mock expander
    });
    expect(env.FULL_API_URL).toBe("https://api.example.com/v1"); // Check expanded value
    expect(env.BASE_URL).toBe("https://api.example.com"); // Check base value
    expect(mockedDotenvExpand).toHaveBeenCalledTimes(1); // Ensure expander was called
  });

  it("should NOT perform expansion when expandVariables is false (default)", () => {
    setupProcessEnv({
      API_URL: "https://required.com",
      SECRET_KEY: "a-valid-secret-key",
    });
    mockDotenvFiles({
      "./.env": {
        BASE_URL: "https://api.example.com",
        FULL_API_URL: "${BASE_URL}/v1", // Should remain unexpanded
      },
    });
    // Use default mock expander (which just returns input)
    const env = createEnv({
      schema: testSchema,
      // expandVariables: false, // Default is false
      _internalDotenvConfig: mockedDotenvConfig,
      _internalDotenvExpand: mockedDotenvExpand,
    });
    expect(env.FULL_API_URL).toBe("${BASE_URL}/v1"); // Check unexpanded value
    expect(env.BASE_URL).toBe("https://api.example.com");
    expect(mockedDotenvExpand).not.toHaveBeenCalled(); // Expander should NOT be called
  });

  it("should expand variables drawing values from both base and env-specific files", () => {
    setupProcessEnv({
      NODE_ENV: "development",
      API_URL: "https://required.com", // Required by schema
      SECRET_KEY: "dev-secret-is-long-enough", // Provided by process.env
    });
    mockDotenvFiles({
      "./.env": {
        BASE_URL: "https://base.api", // Used for expansion
        SECRET_KEY: "base-secret-key-123", // Overridden by env-specific, then process.env
      },
      "./.env.development": {
        FULL_API_URL: "${BASE_URL}/dev", // Uses BASE_URL from merged .env values
        SECRET_KEY: "dev-secret-key-456", // Overrides base, overridden by process.env
      },
    });
    mockedDotenvExpand.mockImplementation(createLocalMockExpander());
    const env = createEnv({
      schema: testSchema,
      expandVariables: true, // Enable expansion
      _internalDotenvConfig: mockedDotenvConfig,
      _internalDotenvExpand: mockedDotenvExpand,
    });
    // Expansion happens on merged .env files BEFORE process.env merge
    expect(env.FULL_API_URL).toBe("https://base.api/dev"); // Expanded correctly
    expect(env.BASE_URL).toBe("https://base.api"); // From base .env
    expect(env.SECRET_KEY).toBe("dev-secret-is-long-enough"); // Final value from process.env
    expect(mockedDotenvExpand).toHaveBeenCalledTimes(1);
  });

  it("should NOT expand variables from process.env", () => {
    setupProcessEnv({
      NODE_ENV: "production",
      BASE_URL: "https://process-base.url", // Should NOT be used for expansion in .env value
      API_URL: "https://required.com",
      SECRET_KEY: "process-secret-is-long",
    });
    mockDotenvFiles({
      "./.env": { FULL_API_URL: "${BASE_URL}/v1" }, // BASE_URL is not defined in any .env file
      "./.env.production": {}, // Empty env-specific file
    });
    mockedDotenvExpand.mockImplementation(createLocalMockExpander());
    const env = createEnv({
      schema: testSchema,
      expandVariables: true,
      _internalDotenvConfig: mockedDotenvConfig,
      _internalDotenvExpand: mockedDotenvExpand,
    });
    // Expansion happens only on values loaded from .env files.
    // Since BASE_URL wasn't in .env files, expansion results in empty string for that part.
    expect(env.FULL_API_URL).toBe("/v1"); // Only '/v1' part remains after failed expansion
    expect(env.BASE_URL).toBe("https://process-base.url"); // Final value from process.env
    expect(mockedDotenvExpand).toHaveBeenCalledTimes(1);
  });

  it("should handle multi-level expansion", () => {
    setupProcessEnv({
      API_URL: "https://required.com",
      SECRET_KEY: "long-enough-secret-key",
    });
    mockDotenvFiles({
      "./.env": {
        VAR_A: "${VAR_B}/pathA", // Depends on VAR_B
        VAR_B: "${VAR_C}", // Depends on VAR_C
        VAR_C: "https://final.value", // Base value
      },
    });
    mockedDotenvExpand.mockImplementation(createLocalMockExpander());
    const env = createEnv({
      schema: testSchema,
      expandVariables: true,
      _internalDotenvConfig: mockedDotenvConfig,
      _internalDotenvExpand: mockedDotenvExpand,
    });
    expect(env.VAR_C).toBe("https://final.value");
    expect(env.VAR_B).toBe("https://final.value");
    expect(env.VAR_A).toBe("https://final.value/pathA");
    expect(mockedDotenvExpand).toHaveBeenCalledTimes(1);
  });

  it("should handle simple circular dependencies by returning empty string (based on mock expander)", () => {
    setupProcessEnv({
      API_URL: "https://required.com",
      SECRET_KEY: "long-enough-secret-key",
    });
    mockDotenvFiles({ "./.env": { VAR_A: "${VAR_B}", VAR_B: "${VAR_A}" } }); // Circular dependency
    mockedDotenvExpand.mockImplementation(createLocalMockExpander());
    const env = createEnv({
      schema: testSchema,
      expandVariables: true,
      _internalDotenvConfig: mockedDotenvConfig,
      _internalDotenvExpand: mockedDotenvExpand,
    });
    // Mock expander should return empty string for circular refs
    expect(env.VAR_A).toBe("");
    expect(env.VAR_B).toBe("");
    expect(mockedDotenvExpand).toHaveBeenCalledTimes(1);
  });

  // --- NEW/MODIFIED Branch Coverage Tests (Expansion) ---
  it("should handle empty .env file when expansion is enabled", () => {
    // Branch: _expandDotEnvValues -> !mergedDotEnvParsed or empty keys
    setupProcessEnv({
      API_URL: "https://required.com",
      SECRET_KEY: "long-enough-secret-key",
    });
    mockDotenvFiles({ "./.env": {} }); // Empty .env file
    const env = createEnv({
      schema: testSchema,
      expandVariables: true, // Enable expansion
      _internalDotenvConfig: mockedDotenvConfig,
      _internalDotenvExpand: mockedDotenvExpand,
    });
    expect(env).toBeDefined();
    expect(mockedDotenvExpand).not.toHaveBeenCalled(); // Should not call expander if no parsed vars
  });

  it("should handle expansion failure gracefully and log error", () => {
    // Branch: _expandDotEnvValues -> catch (e) block
    setupProcessEnv({
      API_URL: "https://required.com",
      SECRET_KEY: "long-enough-secret-key",
    });
    mockDotenvFiles({ "./.env": { VAR_A: "${VAR_B}" } }); // Parsed vars exist
    const expansionError = new Error("Expansion failed!");
    mockedDotenvExpand.mockImplementation(() => {
      throw expansionError;
    }); // Make expander throw

    const env = createEnv({
      schema: testSchema,
      expandVariables: true,
      _internalDotenvConfig: mockedDotenvConfig,
      _internalDotenvExpand: mockedDotenvExpand,
    });

    expect(env.VAR_A).toBe("${VAR_B}"); // Should return unexpanded value
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining(
        `Error during variable expansion: ${expansionError.message}`
      )
    );
    expect(mockedDotenvExpand).toHaveBeenCalledTimes(1);
  });
});

// --- v1.2.0 Multiple .env Path Tests (createEnv) ---
describe("createEnv (Multiple .env Paths)", () => {
  it("should load multiple files sequentially from array, later files overriding", () => {
    setupProcessEnv({
      API_URL: "https://required.com", // Required
      SECRET_KEY: "longenoughsecretkey", // Required
    });
    mockDotenvFiles({
      "./.env.base": {
        FROM_BASE: "yes",
        OVERRIDDEN: "base-value", // Will be overridden by local
        PORT: "1000", // Will be overridden by local
      },
      "./.env.local": {
        FROM_LOCAL: "yes",
        OVERRIDDEN: "local-value", // Overrides base
        PORT: "2000", // Overrides base
      },
    });
    const env = createEnv({
      schema: testSchema,
      dotEnvPath: ["./.env.base", "./.env.local"], // Array input
      _internalDotenvConfig: mockedDotenvConfig,
      _internalDotenvExpand: mockedDotenvExpand,
    });

    expect(env.FROM_BASE).toBe("yes");
    expect(env.FROM_LOCAL).toBe("yes");
    expect(env.OVERRIDDEN).toBe("local-value"); // .env.local overrides .env.base
    expect(env.PORT).toBe(2000); // .env.local overrides .env.base
    expect(mockedDotenvConfig).toHaveBeenCalledTimes(2); // Both files attempted
    expect(mockedDotenvConfig).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ path: "./.env.base" })
    );
    expect(mockedDotenvConfig).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ path: "./.env.local" })
    );
    expect(mockedDotenvExpand).not.toHaveBeenCalled(); // Expansion off
  });

  it("should load multiple files AND environment-specific file, with env-specific overriding array files", () => {
    setupProcessEnv({
      NODE_ENV: "development", // Trigger env-specific loading
      API_URL: "https://required.com",
      SECRET_KEY: "longenoughsecretkey",
    });
    mockDotenvFiles({
      "./.env.base": {
        FROM_BASE: "yes",
        OVERRIDDEN: "base-value", // Overridden by local, then dev
        PORT: "1000", // Overridden by local, then dev
      },
      "./.env.local": {
        FROM_LOCAL: "yes",
        OVERRIDDEN: "local-value", // Overridden by dev
        PORT: "2000", // Overridden by dev
      },
      "./.env.development": {
        FROM_ENV_SPECIFIC: "yes",
        OVERRIDDEN: "dev-value", // Overrides local
        PORT: "3000", // Overrides local
      },
    });
    const env = createEnv({
      schema: testSchema,
      dotEnvPath: ["./.env.base", "./.env.local"],
      _internalDotenvConfig: mockedDotenvConfig,
      _internalDotenvExpand: mockedDotenvExpand,
    });

    expect(env.FROM_BASE).toBe("yes");
    expect(env.FROM_LOCAL).toBe("yes");
    expect(env.FROM_ENV_SPECIFIC).toBe("yes");
    expect(env.OVERRIDDEN).toBe("dev-value"); // .env.development overrides .env.local
    expect(env.PORT).toBe(3000); // .env.development overrides .env.local
    expect(mockedDotenvConfig).toHaveBeenCalledTimes(3); // base, local, and dev attempted
    expect(mockedDotenvConfig).toHaveBeenCalledWith(
      expect.objectContaining({ path: "./.env.base" })
    );
    expect(mockedDotenvConfig).toHaveBeenCalledWith(
      expect.objectContaining({ path: "./.env.local" })
    );
    expect(mockedDotenvConfig).toHaveBeenCalledWith(
      expect.objectContaining({ path: "./.env.development" })
    );
    expect(mockedDotenvExpand).not.toHaveBeenCalled(); // Expansion off
  });

  it("should ignore ENOENT for files within the array path and continue loading", () => {
    setupProcessEnv({
      API_URL: "https://required.com",
      SECRET_KEY: "longenoughsecretkey",
    });
    mockDotenvFiles({
      "./.env.base": { FROM_BASE: "yes", OVERRIDDEN: "base-value" }, // Loaded
      "./.env.missing": "ENOENT", // Mock this file as not found
      "./.env.local": { FROM_LOCAL: "yes", OVERRIDDEN: "local-value" }, // Loaded, overrides base
    });
    const env = createEnv({
      schema: testSchema,
      dotEnvPath: ["./.env.base", "./.env.missing", "./.env.local"],
      _internalDotenvConfig: mockedDotenvConfig,
      _internalDotenvExpand: mockedDotenvExpand,
    });

    expect(env.FROM_BASE).toBe("yes");
    expect(env.FROM_LOCAL).toBe("yes");
    expect(env.OVERRIDDEN).toBe("local-value"); // local still overrides base
    expect(mockedDotenvConfig).toHaveBeenCalledTimes(3); // All three paths attempted
    expect(mockedDotenvConfig).toHaveBeenCalledWith(
      expect.objectContaining({ path: "./.env.base" })
    );
    expect(mockedDotenvConfig).toHaveBeenCalledWith(
      expect.objectContaining({ path: "./.env.missing" })
    );
    expect(mockedDotenvConfig).toHaveBeenCalledWith(
      expect.objectContaining({ path: "./.env.local" })
    );
    // No error should be thrown
  });

  it("should THROW error if a file in the array fails to load (non-ENOENT)", () => {
    setupProcessEnv({
      API_URL: "https://required.com",
      SECRET_KEY: "longenoughsecretkey",
    });
    const loadError = new Error("Read error");
    (loadError as NodeJS.ErrnoException).code = "EIO"; // Example non-ENOENT code
    mockDotenvFiles({
      "./.env.base": { FROM_BASE: "yes", OVERRIDDEN: "base" }, // Should load successfully
      "./.env.bad": loadError, // Mock specific error for this file
      "./.env.local": { FROM_LOCAL: "yes", OVERRIDDEN: "local" }, // Should not be reached
    });

    expect(() => {
      createEnv({
        schema: testSchema,
        dotEnvPath: ["./.env.base", "./.env.bad", "./.env.local"],
        _internalDotenvConfig: mockedDotenvConfig,
        _internalDotenvExpand: mockedDotenvExpand,
      });
    }).toThrow(
      `❌ Failed to load environment file from ./.env.bad: ${loadError.message}`
    );

    // Verify loading stopped at the failing file
    expect(mockedDotenvConfig).toHaveBeenCalledWith(
      expect.objectContaining({ path: "./.env.base" })
    );
    expect(mockedDotenvConfig).toHaveBeenCalledWith(
      expect.objectContaining({ path: "./.env.bad" })
    );
    expect(mockedDotenvConfig).not.toHaveBeenCalledWith(
      expect.objectContaining({ path: "./.env.local" })
    );
    expect(mockedDotenvExpand).not.toHaveBeenCalled();
  });

  it("should load array paths, env-specific, and process.env with correct full precedence", () => {
    setupProcessEnv({
      NODE_ENV: "development",
      API_URL: "https://required.com/from/process", // process.env override
      SECRET_KEY: "process-secret-key-very-long", // process.env override
      OVERRIDDEN: "process-value", // process.env override
      FROM_ENV_SPECIFIC: "process-override", // process.env override
      PORT: "9999", // process.env override for port
    });
    mockDotenvFiles({
      "./.env.base": {
        FROM_BASE: "yes",
        OVERRIDDEN: "base",
        SECRET_KEY: "base-secret-too-short", // Invalid, but overridden
        FROM_ENV_SPECIFIC: "base",
        API_URL: "https://base.url",
        PORT: "1000",
      },
      "./.env.local": {
        FROM_LOCAL: "yes",
        OVERRIDDEN: "local",
        SECRET_KEY: "local-secret-long-enough", // Valid, but overridden
        FROM_ENV_SPECIFIC: "local",
        API_URL: "https://local.url",
        PORT: "2000",
      },
      "./.env.development": {
        OVERRIDDEN: "dev",
        FROM_ENV_SPECIFIC: "dev-real",
        API_URL: "https://dev.url",
        PORT: "3000",
      },
    });
    const env = createEnv({
      schema: testSchema,
      dotEnvPath: ["./.env.base", "./.env.local"],
      _internalDotenvConfig: mockedDotenvConfig,
      _internalDotenvExpand: mockedDotenvExpand,
    });

    // Check final values based on precedence: defaults < base < local < dev < process.env
    expect(env).toEqual(
      expect.objectContaining({
        FROM_BASE: "yes", // From base
        FROM_LOCAL: "yes", // From local
        OVERRIDDEN: "process-value", // From process.env
        FROM_ENV_SPECIFIC: "process-override", // From process.env
        SECRET_KEY: "process-secret-key-very-long", // From process.env
        API_URL: "https://required.com/from/process", // From process.env
        NODE_ENV: "development", // From process.env via schema logic
        PORT: 9999, // From process.env
        BOOLEAN_VAR: false, // default
        BASE_URL: "http://localhost", // default
      })
    );
    expect(mockedDotenvConfig).toHaveBeenCalledTimes(3); // base, local, dev attempted
  });

  it("should perform expansion correctly when using multiple .env paths and env-specific", () => {
    setupProcessEnv({
      NODE_ENV: "development",
      API_URL: "https://required.com",
      SECRET_KEY: "longenoughsecretkey",
    });
    mockDotenvFiles({
      "./.env.base": { BASE_URL: "https://base.url", VAR_A: "base-A" },
      "./.env.local": { VAR_B: "${BASE_URL}/local-B", VAR_A: "local-A" }, // Uses BASE_URL from base, overrides VAR_A
      "./.env.development": { VAR_C: "${VAR_A}-dev" }, // Uses VAR_A from local
    });
    mockedDotenvExpand.mockImplementation(createLocalMockExpander());

    const env = createEnv({
      schema: testSchema,
      dotEnvPath: ["./.env.base", "./.env.local"],
      expandVariables: true, // Enable expansion
      _internalDotenvConfig: mockedDotenvConfig,
      _internalDotenvExpand: mockedDotenvExpand,
    });

    expect(env.BASE_URL).toBe("https://base.url"); // From base
    expect(env.VAR_A).toBe("local-A"); // From local (overrides base)
    expect(env.VAR_B).toBe("https://base.url/local-B"); // Expanded using base BASE_URL
    expect(env.VAR_C).toBe("local-A-dev"); // Expanded using local VAR_A after merge, then dev VAR_C definition
    expect(mockedDotenvExpand).toHaveBeenCalledTimes(1);
  });

  it("should skip non-string paths in dotEnvPath array and warn", () => {
    // Branch: _loadDotEnvFiles -> Array.isArray branch -> filter callback
    setupProcessEnv({
      API_URL: "https://required.com",
      SECRET_KEY: "longenoughsecretkey",
    });
    mockDotenvFiles({
      "./.env.valid": { FROM_BASE: "yes" },
    });

    const env = createEnv({
      schema: testSchema,
      // @ts-expect-error - Deliberately testing invalid input type for the array itself
      dotEnvPath: ["./.env.valid", 123, null, undefined, ""], // Include empty string too
      _internalDotenvConfig: mockedDotenvConfig,
      _internalDotenvExpand: mockedDotenvExpand,
    });

    expect(env.FROM_BASE).toBe("yes");
    // Should be called for "./.env.valid" and "" (empty string is a valid path technically for dotenv)
    expect(mockedDotenvConfig).toHaveBeenCalledTimes(2);
    expect(mockedDotenvConfig).toHaveBeenCalledWith(
      expect.objectContaining({ path: "./.env.valid" })
    );
    expect(mockedDotenvConfig).toHaveBeenCalledWith(
      expect.objectContaining({ path: "" })
    );
    // Warnings for non-string types
    expect(consoleWarnSpy).toHaveBeenCalledTimes(3);
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      expect.stringContaining("Invalid path ignored in dotEnvPath array: 123")
    );
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      expect.stringContaining("Invalid path ignored in dotEnvPath array: null")
    );
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      expect.stringContaining(
        "Invalid path ignored in dotEnvPath array: undefined"
      )
    );
    expect(mockedDotenvExpand).not.toHaveBeenCalled(); // Expansion off
  });
});

// --- v2.0.0 Async Validation Tests (createEnvAsync) ---
describe("createEnvAsync (Asynchronous Validation)", () => {
  const mockSecretSource1: SecretSourceFunction = async () => {
    await new Promise((resolve) => setTimeout(resolve, 10)); // Simulate async fetch
    return {
      FROM_SECRET_MANAGER_1: "secret-value-1",
      OVERRIDDEN: "from-secret-1",
      SECRET_KEY: "secret-key-long-enough-1",
    };
  };

  const mockSecretSource2: SecretSourceFunction = async () => {
    await new Promise((resolve) => setTimeout(resolve, 5));
    return {
      FROM_SECRET_MANAGER_2: "secret-value-2",
      OVERRIDDEN: "from-secret-2", // Should override source 1
    };
  };

  const mockFailingSource: SecretSourceFunction = async () => {
    await new Promise((resolve) => setTimeout(resolve, 5));
    throw new Error("Failed to fetch from this source");
  };

  // --- NEW/MODIFIED Secret Source Mocks for Branch Coverage ---
  const mockSyncErrorSource: SecretSourceFunction = () => {
    // Branch: _fetchSecrets -> catch (syncError) block
    throw new Error("Sync error inside source function");
  };

  const mockNonPromiseSource: SecretSourceFunction = () => {
    // Branch: _fetchSecrets -> else block for non-promise returns
    // Cast to 'any' first, then to the expected Promise type to satisfy TS.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return { SYNC_RETURN: "should-not-work" } as any as Promise<
      Record<string, string | undefined>
    >;
  };

  const mockNonObjectResolvingSource: SecretSourceFunction = async () => {
    // Branch: _fetchSecrets -> results.forEach -> fulfilled but not object
    await new Promise((res) => setTimeout(res, 1));
    // Cast the incorrect return value to satisfy the type checker for the test.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return "i am not an object" as any as Record<string, string | undefined>;
  };

  const mockNullResolvingSource: SecretSourceFunction = async () => {
    // Branch: _fetchSecrets -> results.forEach -> fulfilled but null/undefined
    await new Promise((res) => setTimeout(res, 1));
    // Cast the incorrect return value to satisfy the type checker for the test.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return null as any as Record<string, string | undefined>;
  };

  it("should resolve successfully with combined sources (.env, secrets, process.env)", async () => {
    setupProcessEnv({
      API_URL: "https://process.env.url", // process.env highest priority
      OVERRIDDEN: "from-process", // process.env highest priority
    });
    mockDotenvFiles({
      "./.env": {
        PORT: "1234",
        OVERRIDDEN: "from-dotenv",
        SECRET_KEY: "dotenv-key-too-short", // Invalid, overridden later
      },
    });

    const env = await createEnvAsync({
      schema: testSchema,
      secretsSources: [mockSecretSource1, mockSecretSource2],
      _internalDotenvConfig: mockedDotenvConfig,
      _internalDotenvExpand: mockedDotenvExpand,
    });

    expect(env).toEqual(
      expect.objectContaining({
        NODE_ENV: "development", // Default
        PORT: 1234, // From .env
        API_URL: "https://process.env.url", // From process.env
        SECRET_KEY: "secret-key-long-enough-1", // From secret source 1
        FROM_SECRET_MANAGER_1: "secret-value-1", // From secret source 1
        FROM_SECRET_MANAGER_2: "secret-value-2", // From secret source 2
        OVERRIDDEN: "from-process", // From process.env (highest)
        BOOLEAN_VAR: false, // Default
        BASE_URL: "http://localhost", // Default
      })
    );
    expect(mockedDotenvConfig).toHaveBeenCalledTimes(1); // Only default .env
    expect(mockedDotenvExpand).not.toHaveBeenCalled(); // Expansion off
  });

  it("should correctly apply precedence: .env < secrets < process.env", async () => {
    setupProcessEnv({
      PORT: "9999", // process.env (highest)
      OVERRIDDEN: "process-final", // process.env (highest)
    });
    mockDotenvFiles({
      "./.env": {
        PORT: "1111", // .env (lowest)
        OVERRIDDEN: "dotenv-base", // .env (lowest)
        API_URL: "https://dotenv.url", // .env (used)
      },
    });
    const secretSource: SecretSourceFunction = async () => ({
      PORT: "8888", // secrets (middle)
      OVERRIDDEN: "secret-middle", // secrets (middle)
      SECRET_KEY: "secret-key-is-valid-and-long", // secrets (used)
    });

    const env = await createEnvAsync({
      schema: testSchema,
      secretsSources: [secretSource],
      _internalDotenvConfig: mockedDotenvConfig,
      _internalDotenvExpand: mockedDotenvExpand,
    });

    expect(env.PORT).toBe(9999); // process.env wins
    expect(env.OVERRIDDEN).toBe("process-final"); // process.env wins
    expect(env.API_URL).toBe("https://dotenv.url"); // .env value used
    expect(env.SECRET_KEY).toBe("secret-key-is-valid-and-long"); // secrets value used
  });

  it("should handle expansion correctly within async flow (.env only)", async () => {
    setupProcessEnv({
      API_URL: "https://required.com",
      SECRET_KEY: "longenoughsecretkey",
    });
    mockDotenvFiles({
      "./.env": {
        BASE_URL: "https://env.base",
        FULL_API_URL: "${BASE_URL}/expanded",
      },
    });
    const secretSource: SecretSourceFunction = async () => ({
      // Secrets are added *after* expansion of .env values
      BASE_URL: "https://secret.base", // Should not affect expansion result for FULL_API_URL
    });

    mockedDotenvExpand.mockImplementation(createLocalMockExpander());
    const env = await createEnvAsync({
      schema: testSchema,
      expandVariables: true, // Enable expansion
      secretsSources: [secretSource],
      _internalDotenvConfig: mockedDotenvConfig,
      _internalDotenvExpand: mockedDotenvExpand,
    });

    expect(env.FULL_API_URL).toBe("https://env.base/expanded"); // Expanded using .env value
    expect(env.BASE_URL).toBe("https://secret.base"); // Final value from secrets
    expect(mockedDotenvExpand).toHaveBeenCalledTimes(1);
  });

  it("should resolve successfully even if one secret source fails (async error)", async () => {
    setupProcessEnv({
      API_URL: "https://required.com",
      SECRET_KEY: "valid-process-key", // Use process.env for required key
    });
    mockDotenvFiles({}); // No .env

    const env = await createEnvAsync({
      schema: testSchema,
      secretsSources: [mockFailingSource, mockSecretSource2], // One fails, one succeeds
      _internalDotenvConfig: mockedDotenvConfig,
      _internalDotenvExpand: mockedDotenvExpand,
    });

    expect(env.FROM_SECRET_MANAGER_2).toBe("secret-value-2"); // Value from successful source
    expect(env.OVERRIDDEN).toBe("from-secret-2"); // Value from successful source
    expect(env.SECRET_KEY).toBe("valid-process-key");
    expect(consoleWarnSpy).toHaveBeenCalledTimes(1); // Warning logged for the failing source
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      expect.stringContaining(
        "Secrets source function at index 0 failed: Failed to fetch from this source"
      )
    );
  });

  it("should resolve successfully using other sources if all secret sources fail (multiple failure modes)", async () => {
    // Branch: _fetchSecrets -> successfulFetches === 0 && secretsSources.length > 0
    setupProcessEnv({
      API_URL: "https://required.com",
      SECRET_KEY: "valid-process-key",
      OVERRIDDEN: "from-process-only", // Make sure process.env provides required values
    });
    mockDotenvFiles({});

    const env = await createEnvAsync({
      schema: testSchema,
      secretsSources: [
        mockFailingSource,
        mockSyncErrorSource,
        mockNonPromiseSource,
      ], // All fail
      _internalDotenvConfig: mockedDotenvConfig,
      _internalDotenvExpand: mockedDotenvExpand,
    });

    expect(env.OVERRIDDEN).toBe("from-process-only");
    expect(env.FROM_SECRET_MANAGER_1).toBeUndefined();
    expect(env.FROM_SECRET_MANAGER_2).toBeUndefined();
    expect(consoleWarnSpy).toHaveBeenCalledTimes(4); // 3 for individual failures, 1 for "all failed" summary
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      expect.stringContaining("Secrets source function at index 0 failed")
    );
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      expect.stringContaining(
        "Sync error in secrets source function at index 1"
      )
    );
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      expect.stringContaining(
        "Sync return value from secrets source function at index 2"
      )
    );
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      expect.stringContaining(
        "Warning: All 3 provided secretsSources functions failed"
      )
    );
  });

  it("should handle no secret sources provided", async () => {
    // Branch: _fetchSecrets -> !secretsSources or empty array
    setupProcessEnv({
      API_URL: "https://required.com",
      SECRET_KEY: "valid-process-key",
    });
    mockDotenvFiles({});

    const env = await createEnvAsync({
      schema: testSchema,
      secretsSources: [], // Empty array
      _internalDotenvConfig: mockedDotenvConfig,
      _internalDotenvExpand: mockedDotenvExpand,
    });

    expect(env.API_URL).toBe("https://required.com");
    expect(env.SECRET_KEY).toBe("valid-process-key");
    expect(env.FROM_SECRET_MANAGER_1).toBeUndefined();
    expect(consoleWarnSpy).not.toHaveBeenCalled();
  });

  it("should reject promise if validation fails", async () => {
    setupProcessEnv({
      // Missing SECRET_KEY
      API_URL: "https://required.com",
    });
    mockDotenvFiles({});
    const secretSource: SecretSourceFunction = async () => ({
      // Still missing SECRET_KEY
      PORT: "8888",
    });

    await expect(
      createEnvAsync({
        schema: testSchema,
        secretsSources: [secretSource],
        _internalDotenvConfig: mockedDotenvConfig,
        _internalDotenvExpand: mockedDotenvExpand,
      })
    ).rejects.toThrow("Environment validation failed. Check console output.");

    // Check console.error was called with specific message details
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining("❌ Invalid environment variables:")
    );
    // Check for the "Required" message since the key is missing entirely
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining("- SECRET_KEY: Required")
    );
  });

  it("should reject promise if a synchronous error occurs during setup (e.g., non-ENOENT .env load)", async () => {
    setupProcessEnv({});
    const loadError = new Error("FS error");
    (loadError as NodeJS.ErrnoException).code = "EIO";
    mockDotenvFiles({ "./.env": loadError });

    // Even though the error happens synchronously *within* createEnvAsync,
    // test the rejection of the promise returned by the async function call.
    await expect(
      createEnvAsync({
        // Call the async function
        schema: testSchema,
        _internalDotenvConfig: mockedDotenvConfig,
        _internalDotenvExpand: mockedDotenvExpand,
      })
    ).rejects.toThrow(
      // Assert that the promise REJECTS with the specific error
      `❌ Failed to load environment file from ./.env: ${loadError.message}`
    );
  });

  // --- CORRECTED Test (FINAL) ---
  it("should handle secret sources that return non-object values gracefully and log warning", async () => {
    // Branch: _fetchSecrets -> fulfilled but non-object
    setupProcessEnv({
      API_URL: "https://required.com",
      SECRET_KEY: "valid-process-key", // Use process.env for required key
    });
    mockDotenvFiles({});

    const env = await createEnvAsync({
      schema: testSchema,
      secretsSources: [mockNonObjectResolvingSource, mockSecretSource1], // Non-object first
      _internalDotenvConfig: mockedDotenvConfig,
      _internalDotenvExpand: mockedDotenvExpand,
    });

    // Check value from the VALID source
    expect(env.FROM_SECRET_MANAGER_1).toBe("secret-value-1");
    // Check value from process.env (highest precedence)
    expect(env.SECRET_KEY).toBe("valid-process-key"); // *** FINAL CORRECTION ***
    expect(consoleWarnSpy).toHaveBeenCalledTimes(1); // Only one warning for the non-object source
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      expect.stringContaining(
        "Warning: Secrets source function at index 0 resolved with non-object value: string"
      )
    );
  });

  // --- CORRECTED Test ---
  it("should handle secret source functions that resolve to undefined/null silently", async () => {
    // Branch: _fetchSecrets -> fulfilled but null/undefined value
    setupProcessEnv({
      API_URL: "https://required.com",
      SECRET_KEY: "valid-process-key", // process.env has highest precedence
    });
    mockDotenvFiles({});

    const env = await createEnvAsync({
      schema: testSchema,
      secretsSources: [mockNullResolvingSource, mockSecretSource1], // Null resolving source, then valid source
      _internalDotenvConfig: mockedDotenvConfig,
      _internalDotenvExpand: mockedDotenvExpand,
    });

    expect(env.API_URL).toBe("https://required.com");
    // Check value from process.env (highest precedence)
    expect(env.SECRET_KEY).toBe("valid-process-key"); // *** CORRECTED EXPECTATION ***
    // Check value from the valid secret source
    expect(env.FROM_SECRET_MANAGER_1).toBe("secret-value-1"); // *** ADDED EXPECTATION ***
    expect(consoleWarnSpy).not.toHaveBeenCalled(); // Should be handled silently
  });

  // --- CORRECTED Test ---
  it("should warn if a secret source function returns non-promise", async () => {
    // Branch: _fetchSecrets -> non-promise return
    setupProcessEnv({
      API_URL: "https://required.com",
      SECRET_KEY: "valid-process-key", // process.env has highest precedence
    });
    mockDotenvFiles({});

    // Pass the problematic source function in the array for the test
    const sources = [mockNonPromiseSource, mockSecretSource1];

    const env = await createEnvAsync({
      schema: testSchema,
      secretsSources: sources,
      _internalDotenvConfig: mockedDotenvConfig,
      _internalDotenvExpand: mockedDotenvExpand,
    });

    // Should still succeed using process.env and other valid sources
    expect(env.SECRET_KEY).toBe("valid-process-key"); // *** CORRECTED EXPECTATION ***
    expect(env.FROM_SECRET_MANAGER_1).toBe("secret-value-1"); // *** KEPT EXPECTATION ***

    expect(consoleWarnSpy).toHaveBeenCalledTimes(1); // Should warn about non-promise return
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      expect.stringContaining(
        "Sync return value from secrets source function at index 0. Function must return a Promise."
      )
    );
  });

  // --- CORRECTED Test ---
  it("should resolve successfully if a source rejects with non-Error but validation passes", async () => {
    // Branch: createEnvAsync -> catch block -> !(error instanceof Error) - THIS TEST NOW CHECKS RESOLUTION
    setupProcessEnv({
      API_URL: "https://required.com", // Provided by process.env
      SECRET_KEY: "valid-process-key", // Provided by process.env
    });
    mockDotenvFiles({});
    const nonErrorRejectionSource = () =>
      Promise.reject("just a string rejection");

    // Pass the problematic source function in the array for the test
    const sources = [nonErrorRejectionSource];

    // The promise should RESOLVE because validation passes using process.env
    await expect(
      createEnvAsync({
        schema: testSchema,
        secretsSources: sources, // Use the sources array
        _internalDotenvConfig: mockedDotenvConfig,
        _internalDotenvExpand: mockedDotenvExpand,
      })
    ).resolves.toEqual(
      expect.objectContaining({
        API_URL: "https://required.com", // Check resolved value is from process.env
        SECRET_KEY: "valid-process-key", // Check resolved value is from process.env
      })
    ); // *** CORRECTED EXPECTATION ***

    // Check that the correct warnings were logged
    // Warning for the failed source
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      expect.stringContaining(
        "Warning: Secrets source function at index 0 failed: just a string rejection"
      )
    );
    // Warning for all sources failed
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      expect.stringContaining(
        "Warning: All 1 provided secretsSources functions failed"
      )
    );
    // Should not have called console.error
    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });

  it("should THROW if schema is not a ZodObject (createEnvAsync)", async () => {
    // Branch: createEnvAsync -> !(schema instanceof ZodObject)
    setupProcessEnv({});
    mockDotenvFiles({});
    // Use await/rejects pattern for async function's sync throw
    await expect(
      createEnvAsync({
        // @ts-expect-error - Deliberately passing invalid schema type
        schema: z.string(), // Pass a non-object schema
        _internalDotenvConfig: mockedDotenvConfig,
        _internalDotenvExpand: mockedDotenvExpand,
      })
    ).rejects.toThrow("Invalid schema provided. Expected a ZodObject."); // Use rejects for async function

    expect(mockedDotenvConfig).not.toHaveBeenCalled();
    expect(mockedDotenvExpand).not.toHaveBeenCalled();
  });
});
