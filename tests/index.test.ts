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
const mockedDotenvConfig = jest.fn<DotenvConfigFunction>();

// This mock implements the behavior of dotenv-expand on a parsed object
const createLocalMockExpander = (): DotenvExpandFunction => {
  return (config: DotenvConfigOutput): DotenvConfigOutput => {
    // Return config as-is if there's an error or no parsed data
    if (config.error || !config.parsed) {
      return config;
    }

    // Deep copy the parsed object to avoid mutating the original mock data
    const parsedCopy: DotenvParseOutput = JSON.parse(JSON.stringify(config.parsed));
    const lookupValues = { ...parsedCopy }; // Use the current state for lookups

    const expandValue = (value: string, processing: Set<string>): string => {
      // Detect simple circular dependencies or self-references during a single expansion chain
      return value.replace(/\$\{([^}]+)\}/g, (match, varName) => {
        if (processing.has(varName)) {
          // Simple cycle detected in this path, return empty string or the original segment?
          // dotenv-expand default behavior on simple cycles is often empty string or original. Let's mock empty string for simplicity.
          return "";
        }

        // If the variable exists in the current lookup values (which includes previously expanded)
        if (lookupValues[varName] !== undefined) {
          processing.add(varName); // Add to processing set for this chain
          const expanded = expandValue(lookupValues[varName], processing); // Recursively expand
          processing.delete(varName); // Remove after expanding this segment
          return expanded;
        }

        // If variable not found, replace with empty string (dotenv-expand behavior)
        return "";
      });
    };

    // Iterate through the copied parsed data and expand values in place
    for (const key in parsedCopy) {
      if (
        Object.prototype.hasOwnProperty.call(parsedCopy, key) &&
        typeof parsedCopy[key] === "string"
      ) {
        const processing = new Set<string>(); // Set to track variables in the current expansion chain
        parsedCopy[key] = expandValue(parsedCopy[key] as string, processing);
      }
    }

    // Return the object with expanded values
    return { parsed: parsedCopy };
  };
};


// --- Test Schema (Ensure it includes vars for new tests) ---
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
  originalProcessEnv = { ...process.env };
  // Clear relevant environment variables before each test
  const keysToClear = [
    ...Object.keys(testSchema.shape), // Clear variables defined in the schema
    "NODE_ENV", // Ensure NODE_ENV is cleared unless explicitly set for a test
    "MISSING_VAR", // Clear any dummy variables used in tests
  ];
  // Use a Set for efficient clearing of potentially overlapping keys
  new Set(keysToClear).forEach((key) => {
    delete process.env[key];
  });
  // Ensure NODE_ENV is explicitly deleted
  delete process.env.NODE_ENV;
});

afterEach(() => {
  // Restore original process.env after each test
  process.env = originalProcessEnv;
});

// --- Helpers ---
const setupProcessEnv = (envVars: Record<string, string | undefined>) => {
  // Clear existing process.env first to isolate tests, then set provided ones
  Object.keys(process.env).forEach(key => {
    delete process.env[key];
  });
  for (const key in envVars) {
    if (envVars[key] !== undefined) {
      process.env[key] = envVars[key];
    } else {
      // If value is undefined, ensure the key is removed from process.env
      delete process.env[key];
    }
  }
};


const mockDotenvFiles = (
  files: Record<
    string,
    Record<string, string> | NodeJS.ErrnoException | "ENOENT" | undefined
  >
) => {
  mockedDotenvConfig.mockImplementation((options) => {
    const filePathMaybe = options?.path;
    let pathKey: string | undefined = undefined;

    // Determine the expected path key for the mock lookup
    if (typeof filePathMaybe === "string") {
      pathKey = filePathMaybe;
    } else {
      // dotenv.config() default path is './.env' if options.path is not provided
      pathKey = "./.env";
    }

    // Find the mock data for the requested path
    const data = files[pathKey];

    // Handle different mock data types
    if (data === "ENOENT") {
      // Simulate file not found error
      const error = new Error(
        `ENOENT: no such file or directory, open '${pathKey}' (mocked)`
      );
      (error as NodeJS.ErrnoException).code = "ENOENT";
      return { error };
    } else if (data instanceof Error) {
      // Simulate other file access errors (e.g., permissions)
      return { error: data };
    } else if (data !== undefined) {
      // Simulate successful loading with parsed data
      // Return a copy to prevent tests from accidentally mutating the mock data
      return { parsed: { ...data } };
    } else {
      // If no mock data is provided for this path, simulate ENOENT by default
      const error = new Error(
        `ENOENT: no such file or directory, open '${pathKey}' (default mock)`
      );
      (error as NodeJS.ErrnoException).code = "ENOENT";
      return { error };
    }
  });
};


// --- v1.0.0 Core Functionality Tests ---
describe("createEnv (v1.0.0 Functionality)", () => {

  it("should return validated env with defaults when no sources provide values", () => {
    setupProcessEnv({
      API_URL: "https://test.com", // Required
      SECRET_KEY: "longenoughsecretkey", // Required
    });
    mockDotenvFiles({}); // No .env file exists (ENOENT)
    const env = createEnv({
      schema: testSchema,
      _internalDotenvConfig: mockedDotenvConfig,
    });
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
    // Should attempt to load the default ./.env file
    expect(mockedDotenvConfig).toHaveBeenCalledTimes(1);
    expect(mockedDotenvConfig).toHaveBeenCalledWith({ path: "./.env" });
  });

  it("should return validated env with values from .env overriding defaults", () => {
    setupProcessEnv({}); // No process.env variables set
    const mockDotEnvData = {
      NODE_ENV: "production",
      PORT: "3000", // Will be coerced to number by Zod
      API_URL: "https://from-dotenv.com",
      SECRET_KEY: "secretkeyfromdotenv",
      BOOLEAN_VAR: "true", // Will be coerced to boolean by Zod
      BASE_URL: "https://api.prod.com",
    };
    mockDotenvFiles({ "./.env": mockDotEnvData });
    const env = createEnv({
      schema: testSchema,
      _internalDotenvConfig: mockedDotenvConfig,
    });
    expect(env).toEqual(
      expect.objectContaining({
        NODE_ENV: "production",
        PORT: 3000, // Coerced number
        API_URL: "https://from-dotenv.com",
        SECRET_KEY: "secretkeyfromdotenv",
        BOOLEAN_VAR: true, // Coerced boolean
        BASE_URL: "https://api.prod.com",
      })
    );
    // Should attempt to load the default ./.env file
    expect(mockedDotenvConfig).toHaveBeenCalledTimes(1);
    expect(mockedDotenvConfig).toHaveBeenCalledWith({ path: "./.env" });
  });

  it("should return validated env with process.env overriding .env and defaults", () => {
    setupProcessEnv({
      PORT: "9999", // process.env overrides .env
      SECRET_KEY: "processenvsecret-longenough", // process.env overrides .env
      OPTIONAL_VAR: "hello from process", // Only in process.env
      NODE_ENV: "test", // process.env overrides .env default
    });
    const mockDotEnvData = {
      PORT: "3000",
      API_URL: "https://from-dotenv.com", // Only in .env
      SECRET_KEY: "dotenvsecret-too-short", // Will be overridden by process.env
      BOOLEAN_VAR: "1", // Only in .env (will be coerced)
    };
    mockDotenvFiles({ "./.env": mockDotEnvData });
    const env = createEnv({
      schema: testSchema,
      _internalDotenvConfig: mockedDotenvConfig,
    });
    expect(env).toEqual(
      expect.objectContaining({
        NODE_ENV: "test", // From process.env
        PORT: 9999, // From process.env (coerced)
        API_URL: "https://from-dotenv.com", // From .env
        SECRET_KEY: "processenvsecret-longenough", // From process.env
        OPTIONAL_VAR: "hello from process", // From process.env
        BOOLEAN_VAR: true, // From .env (coerced)
        BASE_URL: "http://localhost", // Default (not in process.env or .env)
      })
    );
    // Should attempt to load the default ./.env file
    expect(mockedDotenvConfig).toHaveBeenCalledTimes(1);
    expect(mockedDotenvConfig).toHaveBeenCalledWith({ path: "./.env" });
  });

  it("should throw validation error if required variables are missing", () => {
    setupProcessEnv({ SECRET_KEY: "onlythesecretisprovided" }); // API_URL is missing
    mockDotenvFiles({});
    const consoleErrorSpy = jest
      .spyOn(console, "error")
      .mockImplementation(() => { });
    expect(() => {
      createEnv({
        schema: testSchema,
        _internalDotenvConfig: mockedDotenvConfig,
      });
    }).toThrow("Environment validation failed. Check console output.");
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining("❌ Invalid environment variables:")
    );
    // Should report the missing API_URL
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining("- API_URL: Required")
    );
    // Should not report SECRET_KEY as it was provided
    expect(consoleErrorSpy).not.toHaveBeenCalledWith(
      expect.stringContaining("- SECRET_KEY")
    );
    consoleErrorSpy.mockRestore(); // Clean up the spy
  });

  it("should not load any .env files if dotEnvPath is false", () => {
    setupProcessEnv({
      API_URL: "https://no-dotenv.com", // Required
      SECRET_KEY: "thiskeyislongenough", // Required
    });
    // NODE_ENV set, but dotEnvPath: false should prevent loading any files
    process.env.NODE_ENV = "production";

    const env = createEnv({
      schema: testSchema,
      dotEnvPath: false, // Explicitly disable .env loading
      _internalDotenvConfig: mockedDotenvConfig,
    });
    expect(env.API_URL).toBe("https://no-dotenv.com");
    expect(env.SECRET_KEY).toBe("thiskeyislongenough");
    expect(env.PORT).toBe(8080); // Default value as no .env file was loaded
    expect(env.NODE_ENV).toBe("production"); // From process.env

    // Should not call dotenv.config at all
    expect(mockedDotenvConfig).not.toHaveBeenCalled();
  });

  it("should THROW error if .env file fails to load (other than ENOENT)", () => {
    setupProcessEnv({}); // No process.env vars
    const loadError = new Error("Permission denied");
    (loadError as NodeJS.ErrnoException).code = "EACCES"; // Example non-ENOENT code
    mockDotenvFiles({ "./.env": loadError }); // Mock specific error for the default path

    expect(() => {
      createEnv({
        schema: testSchema,
        _internalDotenvConfig: mockedDotenvConfig,
      });
    }).toThrow(
      `❌ Failed to load environment file from ./.env: ${loadError.message}`
    );
    // Should have attempted to load the default ./.env
    expect(mockedDotenvConfig).toHaveBeenCalledTimes(1);
    expect(mockedDotenvConfig).toHaveBeenCalledWith({ path: "./.env" });
  });

}); // End v1.0.0 tests


// --- v1.2.0 Loading & Expansion Tests ---
describe("createEnv (v1.2.0 Functionality)", () => {

  // --- Environment-Specific File Loading Tests ---
  describe("Environment-Specific Files", () => {
    it("should load .env only if NODE_ENV is not set (using default path)", () => {
      setupProcessEnv({}); // No NODE_ENV set
      mockDotenvFiles({
        "./.env": { // Only default file exists
          API_URL: "https://base.com",
          SECRET_KEY: "base-secret-key-123",
        },
      });
      const env = createEnv({
        schema: testSchema,
        _internalDotenvConfig: mockedDotenvConfig,
      });
      expect(env.API_URL).toBe("https://base.com");
      expect(env.SECRET_KEY).toBe("base-secret-key-123");
      expect(env.NODE_ENV).toBe("development"); // Default from schema
      expect(mockedDotenvConfig).toHaveBeenCalledTimes(1); // Only default .env loaded
      expect(mockedDotenvConfig).toHaveBeenCalledWith({ path: "./.env" });
    });

    it("should load .env and .env.development if NODE_ENV=development", () => {
      setupProcessEnv({ NODE_ENV: "development" }); // NODE_ENV is set
      mockDotenvFiles({
        "./.env": { // Base file
          API_URL: "https://base.com",
          SECRET_KEY: "base-secret-key-123",
          PORT: "1111",
        },
        "./.env.development": { // Env-specific file
          API_URL: "https://dev.com", // Overrides base
          SECRET_KEY: "dev-secret-key-456", // Overrides base
        },
      });
      const env = createEnv({
        schema: testSchema,
        _internalDotenvConfig: mockedDotenvConfig,
      });
      expect(env.API_URL).toBe("https://dev.com"); // From env-specific
      expect(env.SECRET_KEY).toBe("dev-secret-key-456"); // From env-specific
      expect(env.PORT).toBe(1111); // From base (not overridden)
      expect(env.NODE_ENV).toBe("development"); // From process.env (highest precedence, but also matches env-specific file)

      // Should attempt to load default .env first, then .env.development
      expect(mockedDotenvConfig).toHaveBeenCalledTimes(2);
      expect(mockedDotenvConfig).toHaveBeenNthCalledWith(1, { path: "./.env" });
      expect(mockedDotenvConfig).toHaveBeenNthCalledWith(2, {
        path: "./.env.development",
      });
    });

    it("should load base .env only if environment-specific file is not found (ENOENT)", () => {
      setupProcessEnv({ NODE_ENV: "test" }); // NODE_ENV is set
      mockDotenvFiles({
        "./.env": { // Base file
          API_URL: "https://base.com",
          SECRET_KEY: "base-secret-key-123",
        },
        "./.env.test": "ENOENT", // Env-specific file not found
      });
      const env = createEnv({
        schema: testSchema,
        _internalDotenvConfig: mockedDotenvConfig,
      });
      expect(env.API_URL).toBe("https://base.com"); // From base
      expect(env.SECRET_KEY).toBe("base-secret-key-123"); // From base
      expect(env.NODE_ENV).toBe("test"); // From process.env
      expect(mockedDotenvConfig).toHaveBeenCalledTimes(2); // Attempted base and env-specific
      expect(mockedDotenvConfig).toHaveBeenCalledWith({ path: "./.env" });
      expect(mockedDotenvConfig).toHaveBeenCalledWith({ path: "./.env.test" });
    });

    it("should correctly merge: Defaults < Base .env < Env-specific .env < process.env (single base path)", () => {
      setupProcessEnv({
        NODE_ENV: "production", // 1. process.env (highest)
        SECRET_KEY: "process-secret-key-final", // 1. process.env overrides all .env
        PORT: "5555", // 1. process.env overrides .env.production
        OPTIONAL_VAR: "from-process", // 1. process.env
      });
      mockDotenvFiles({
        "./.env": { // 3. Base .env
          API_URL: "https://base.com", // 3. Base .env (overridden by env-specific)
          SECRET_KEY: "base-secret-key-123-short", // 3. Base .env (overridden by env-specific)
          BOOLEAN_VAR: "true", // 3. Base .env
          BASE_URL: "https://base.url", // 3. Base .env (overridden by env-specific)
          OVERRIDDEN: "from-base", // 3. Base .env (overridden by local/env-specific if they existed)
          FROM_BASE: "yes", // Only in base
        },
        "./.env.production": { // 2. Env-specific .env (overrides base)
          API_URL: "https://prod.com", // 2. Env-specific (overrides base)
          SECRET_KEY: "prod-secret-key-456-long", // 2. Env-specific (overridden by process.env)
          PORT: "9000", // 2. Env-specific (overridden by process.env)
          BASE_URL: "https://prod.url", // 2. Env-specific (overrides base)
          OVERRIDDEN: "from-prod", // 2. Env-specific
          FROM_ENV_SPECIFIC: "yes", // Only in env-specific
        },
      });
      const env = createEnv({
        schema: testSchema,
        _internalDotenvConfig: mockedDotenvConfig,
      });
      expect(env).toEqual(
        expect.objectContaining({
          NODE_ENV: "production", // From process.env
          PORT: 5555, // From process.env
          API_URL: "https://prod.com", // From .env.production
          SECRET_KEY: "process-secret-key-final", // From process.env
          OPTIONAL_VAR: "from-process", // From process.env
          BOOLEAN_VAR: true, // From .env
          BASE_URL: "https://prod.url", // From .env.production
          OVERRIDDEN: "from-prod", // From .env.production
          FROM_BASE: "yes", // From .env
          FROM_ENV_SPECIFIC: "yes", // From .env.production
        })
      );
      expect(mockedDotenvConfig).toHaveBeenCalledTimes(2); // Attempted base and env-specific
      expect(mockedDotenvConfig).toHaveBeenCalledWith({ path: "./.env" });
      expect(mockedDotenvConfig).toHaveBeenCalledWith({
        path: "./.env.production",
      });
    });
  }); // End Environment-Specific File Loading Tests

  // --- Variable Expansion Tests ---
  describe("Variable Expansion", () => {
    it("should perform expansion when expandVariables is true (single .env)", () => {
      setupProcessEnv({
        API_URL: "https://required.com", // Required by schema
        SECRET_KEY: "some-secret-key-that-is-long", // Required by schema
      });
      mockDotenvFiles({
        "./.env": {
          BASE_URL: "https://api.example.com",
          FULL_API_URL: "${BASE_URL}/v1", // Should be expanded
        },
      });
      const localMockExpander = createLocalMockExpander();
      const env = createEnv({
        schema: testSchema,
        expandVariables: true, // Enable expansion
        _internalDotenvConfig: mockedDotenvConfig,
        _internalDotenvExpand: localMockExpander,
      });
      expect(env.FULL_API_URL).toBe("https://api.example.com/v1"); // Expanded value
      expect(env.BASE_URL).toBe("https://api.example.com"); // Base value itself is kept
      expect(localMockExpander).toHaveBeenCalledTimes(1);
    });

    it("should NOT perform expansion when expandVariables is false (default)", () => {
      setupProcessEnv({
        API_URL: "https://required.com", // Required by schema
        SECRET_KEY: "a-valid-secret-key", // Required by schema
      });
      mockDotenvFiles({
        "./.env": {
          BASE_URL: "https://api.example.com",
          FULL_API_URL: "${BASE_URL}/v1", // Should NOT be expanded
        },
      });
      const localMockExpander = createLocalMockExpander(); // Still provide mock, but expect it not to be called
      const env = createEnv({
        schema: testSchema,
        // expandVariables defaults to false
        _internalDotenvConfig: mockedDotenvConfig,
        _internalDotenvExpand: localMockExpander,
      });
      expect(env.FULL_API_URL).toBe("${BASE_URL}/v1"); // Raw value
      expect(env.BASE_URL).toBe("https://api.example.com"); // Base value
      expect(localMockExpander).not.toHaveBeenCalled(); // Expander should not have been called
    });

    it("should expand variables drawing values from both base and env-specific files", () => {
      setupProcessEnv({
        NODE_ENV: "development",
        API_URL: "https://required.com", // Required
        SECRET_KEY: "dev-secret-is-long-enough", // Required (process.env overrides .env files)
      });
      mockDotenvFiles({
        "./.env": { // Base file
          BASE_URL: "https://base.api",
          SECRET_KEY: "base-secret-key-123-short", // Overridden by env-specific, then process.env
        },
        "./.env.development": { // Env-specific file (loaded after base)
          FULL_API_URL: "${BASE_URL}/dev", // Should expand using BASE_URL from base file
          SECRET_KEY: "dev-secret-key-456-long", // Overridden by process.env
        },
      });
      const localMockExpander = createLocalMockExpander();
      const env = createEnv({
        schema: testSchema,
        expandVariables: true, // Enable expansion
        _internalDotenvConfig: mockedDotenvConfig,
        _internalDotenvExpand: localMockExpander,
      });
      expect(env.FULL_API_URL).toBe("https://base.api/dev"); // Expanded correctly (BASE_URL from base, then /dev from env-specific)
      expect(env.BASE_URL).toBe("https://base.api"); // From base
      expect(env.SECRET_KEY).toBe("dev-secret-is-long-enough"); // From process.env (highest precedence)
      expect(localMockExpander).toHaveBeenCalledTimes(1);
      // The input to expander should be the merged object from .env files only
      expect(localMockExpander).toHaveBeenCalledWith(
        expect.objectContaining({
          parsed: {
            BASE_URL: "https://base.api",
            SECRET_KEY: "dev-secret-key-456-long", // env-specific overrode base
            FULL_API_URL: "${BASE_URL}/dev",
          }
        })
      );
    });

    it("should NOT expand variables from process.env", () => {
      setupProcessEnv({
        NODE_ENV: "production",
        // BASE_URL is in process.env
        BASE_URL: "https://process-base.url",
        API_URL: "https://required.com", // Required
        SECRET_KEY: "process-secret-is-long-enough", // Required
      });
      mockDotenvFiles({
        "./.env": {
          // FULL_API_URL references BASE_URL.
          // BASE_URL is in process.env *and* schema default.
          // Expansion happens *before* merging with process.env.
          // So, expansion should *not* see the process.env BASE_URL.
          FULL_API_URL: "${BASE_URL}/v1"
        },
        "./.env.production": {}, // Env-specific file empty
      });
      const localMockExpander = createLocalMockExpander();
      const env = createEnv({
        schema: testSchema,
        expandVariables: true, // Enable expansion
        _internalDotenvConfig: mockedDotenvConfig,
        _internalDotenvExpand: localMockExpander,
      });
      // Expansion used the schema default BASE_URL "http://localhost" because it didn't see process.env
      expect(env.FULL_API_URL).toBe("http://localhost/v1");
      // After expansion and .env merge, process.env is merged, overriding the BASE_URL
      expect(env.BASE_URL).toBe("https://process-base.url"); // From process.env (highest precedence)
      expect(localMockExpander).toHaveBeenCalledTimes(1);
      // Input to expand should only include the merged .env values (which is just FULL_API_URL here)
      expect(localMockExpander).toHaveBeenCalledWith(
        expect.objectContaining({
          parsed: {
            FULL_API_URL: "${BASE_URL}/v1",
            // BASE_URL is not in .env files, so it shouldn't be in the parsed object passed to expand
            // The expander implementation needs to handle lookups *within* the provided parsed object
          }
        })
      );
      // Re-evaluate mock expander implementation to only look within its input config.parsed
    });

    it("should handle multi-level expansion", () => {
      setupProcessEnv({
        API_URL: "https://required.com", // Required
        SECRET_KEY: "long-enough-secret-key-req", // Required
      });
      mockDotenvFiles({
        "./.env": {
          VAR_A: "${VAR_B}/pathA",
          VAR_B: "${VAR_C}",
          VAR_C: "https://final.value",
        },
      });
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
      expect(localMockExpander).toHaveBeenCalledTimes(1);
    });

    it("should handle simple circular dependencies by returning empty string", () => {
      setupProcessEnv({
        API_URL: "https://required.com", // Required
        SECRET_KEY: "long-enough-secret-key-req", // Required
      });
      mockDotenvFiles({ "./.env": { VAR_A: "${VAR_B}", VAR_B: "${VAR_A}" } }); // VAR_A -> VAR_B -> VAR_A
      const localMockExpander = createLocalMockExpander();
      const env = createEnv({
        schema: testSchema,
        expandVariables: true,
        _internalDotenvConfig: mockedDotenvConfig,
        _internalDotenvExpand: localMockExpander,
      });
      // Mock expander handles simple cycles by returning empty string
      expect(env.VAR_A).toBe("");
      expect(env.VAR_B).toBe("");
      expect(localMockExpander).toHaveBeenCalledTimes(1);
    });

    it("should handle expansion for variables defined in the schema but only in .env files", () => {
      setupProcessEnv({
        API_URL: "https://required.com", // Required
        SECRET_KEY: "long-enough-secret-key-req", // Required
      });
      mockDotenvFiles({
        "./.env": {
          // EMPTY_VAR_EXPANDED is optional in schema, only defined here
          EMPTY_VAR_EXPANDED: "prefix-${NON_EXISTENT_VAR}-suffix"
        }
      });
      const localMockExpander = createLocalMockExpander();
      const env = createEnv({
        schema: testSchema,
        expandVariables: true,
        _internalDotenvConfig: mockedDotenvConfig,
        _internalDotenvExpand: localMockExpander,
      });

      // Non-existent variable in expansion becomes empty string
      expect(env.EMPTY_VAR_EXPANDED).toBe("prefix--suffix");
      expect(localMockExpander).toHaveBeenCalledTimes(1);
    });

  }); // End Variable Expansion Tests


  // --- Multiple .env Path Tests ---
  describe("Multiple .env Paths", () => {
    it("should load multiple files sequentially from array, later files overriding", () => {
      setupProcessEnv({
        API_URL: "https://required.com", // Required
        SECRET_KEY: "longenoughsecretkey", // Required
      });
      mockDotenvFiles({
        "./.env.base": { // Loaded first
          FROM_BASE: "yes",
          OVERRIDDEN: "base-value", // Will be overridden by local
          PORT: "1000", // Will be overridden by local
        },
        "./.env.local": { // Loaded second
          FROM_LOCAL: "yes",
          OVERRIDDEN: "local-value", // Overrides base
          PORT: "2000", // Overrides base
        },
      });
      const env = createEnv({
        schema: testSchema,
        dotEnvPath: ["./.env.base", "./.env.local"], // Array input
        _internalDotenvConfig: mockedDotenvConfig,
      });

      expect(env.FROM_BASE).toBe("yes"); // From base file
      expect(env.FROM_LOCAL).toBe("yes"); // From local file
      expect(env.OVERRIDDEN).toBe("local-value"); // local file overrides base
      expect(env.PORT).toBe(2000); // local file overrides base (coerced)
      expect(mockedDotenvConfig).toHaveBeenCalledTimes(2); // Attempted both files in the array
      expect(mockedDotenvConfig).toHaveBeenNthCalledWith(1, {
        path: "./.env.base",
      });
      expect(mockedDotenvConfig).toHaveBeenNthCalledWith(2, {
        path: "./.env.local",
      });
    });

    it("should load multiple files AND environment-specific file, with env-specific overriding array files", () => {
      setupProcessEnv({
        NODE_ENV: "development", // Triggers .env.development load
        API_URL: "https://required.com", // Required
        SECRET_KEY: "longenoughsecretkey", // Required
      });
      mockDotenvFiles({
        "./.env.base": { // Loaded first in array
          FROM_BASE: "yes",
          OVERRIDDEN: "base-value", // Overridden by local, then dev
          PORT: "1000", // Overridden by local, then dev
        },
        "./.env.local": { // Loaded second in array
          FROM_LOCAL: "yes",
          OVERRIDDEN: "local-value", // Overridden by dev
          PORT: "2000", // Overridden by dev
        },
        "./.env.development": { // Loaded after array files
          FROM_ENV_SPECIFIC: "yes",
          OVERRIDDEN: "dev-value", // Overrides local (and base)
          PORT: "3000", // Overrides local (and base)
        },
      });
      const env = createEnv({
        schema: testSchema,
        dotEnvPath: ["./.env.base", "./.env.local"], // Array input
        _internalDotenvConfig: mockedDotenvConfig,
      });

      expect(env.FROM_BASE).toBe("yes"); // From base
      expect(env.FROM_LOCAL).toBe("yes"); // From local
      expect(env.FROM_ENV_SPECIFIC).toBe("yes"); // From env-specific
      expect(env.OVERRIDDEN).toBe("dev-value"); // .env.development overrides .env.local (which overrode .env.base)
      expect(env.PORT).toBe(3000); // .env.development overrides .env.local (which overrode .env.base) (coerced)

      // Should attempt to load files in array order, then the env-specific file
      expect(mockedDotenvConfig).toHaveBeenCalledTimes(3);
      expect(mockedDotenvConfig).toHaveBeenNthCalledWith(1, { path: "./.env.base" });
      expect(mockedDotenvConfig).toHaveBeenNthCalledWith(2, { path: "./.env.local" });
      expect(mockedDotenvConfig).toHaveBeenNthCalledWith(3, {
        path: "./.env.development",
      });
    });

    it("should ignore ENOENT for files within the array path and continue loading", () => {
      setupProcessEnv({
        API_URL: "https://required.com", // Required
        SECRET_KEY: "longenoughsecretkey", // Required
      });
      mockDotenvFiles({
        "./.env.base": { FROM_BASE: "yes", OVERRIDDEN: "base-value" }, // Loaded first
        "./.env.missing": "ENOENT", // Mock this file as not found - should be ignored
        "./.env.local": { FROM_LOCAL: "yes", OVERRIDDEN: "local-value" }, // Loaded after missing
      });
      const env = createEnv({
        schema: testSchema,
        dotEnvPath: ["./.env.base", "./.env.missing", "./.env.local"], // Array including a missing file
        _internalDotenvConfig: mockedDotenvConfig,
      });

      expect(env.FROM_BASE).toBe("yes"); // From base
      expect(env.FROM_LOCAL).toBe("yes"); // From local
      expect(env.OVERRIDDEN).toBe("local-value"); // local still overrides base
      // Should attempt to load all files in the array, ignoring ENOENT for the missing one
      expect(mockedDotenvConfig).toHaveBeenCalledTimes(3);
      expect(mockedDotenvConfig).toHaveBeenCalledWith({ path: "./.env.base" });
      expect(mockedDotenvConfig).toHaveBeenCalledWith({ path: "./.env.missing" }); // Ensure attempt was made
      expect(mockedDotenvConfig).toHaveBeenCalledWith({ path: "./.env.local" });
    });

    it("should THROW error if a file in the array fails to load (non-ENOENT)", () => {
      setupProcessEnv({
        API_URL: "https://required.com", // Required
        SECRET_KEY: "longenoughsecretkey", // Required
      });
      const loadError = new Error("Read error");
      (loadError as NodeJS.ErrnoException).code = "EIO"; // Example non-ENOENT code
      mockDotenvFiles({
        "./.env.base": { FROM_BASE: "yes", OVERRIDDEN: "base" }, // Loaded successfully
        "./.env.bad": loadError, // Mock specific error - should cause throw
        "./.env.local": { FROM_LOCAL: "yes", OVERRIDDEN: "local" }, // This file should NOT be loaded
      });

      expect(() => {
        createEnv({
          schema: testSchema,
          dotEnvPath: ["./.env.base", "./.env.bad", "./.env.local"], // Array including a bad file
          _internalDotenvConfig: mockedDotenvConfig,
        });
      }).toThrow(
        `❌ Failed to load environment file from ./.env.bad: ${loadError.message}`
      );

      // Verify loading stopped at the failing file
      expect(mockedDotenvConfig).toHaveBeenCalledTimes(2); // Attempted base and bad
      expect(mockedDotenvConfig).toHaveBeenCalledWith({ path: "./.env.base" });
      expect(mockedDotenvConfig).toHaveBeenCalledWith({ path: "./.env.bad" });
      expect(mockedDotenvConfig).not.toHaveBeenCalledWith({ // Should not attempt the file after the bad one
        path: "./.env.local",
      });
    });

    it("should load array paths, env-specific, and process.env with correct full precedence", () => {
      setupProcessEnv({
        NODE_ENV: "development", // process.env (highest) - triggers .env.development load
        API_URL: "https://required.com/from/process", // process.env overrides all .env
        SECRET_KEY: "process-secret-key-very-long", // process.env overrides all .env
        OVERRIDDEN: "process-value", // process.env overrides all .env
        FROM_ENV_SPECIFIC: "process-override", // process.env overrides env-specific
        PORT: "9999", // process.env overrides env-specific
      });
      mockDotenvFiles({
        "./.env.base": { // Array path 1 (lowest .env precedence)
          FROM_BASE: "yes",
          OVERRIDDEN: "base", // overridden by local, dev, process.env
          SECRET_KEY: "base-secret-too-short", // overridden by local, dev, process.env
          FROM_ENV_SPECIFIC: "base", // overridden by dev, process.env
          API_URL: "https://base.url", // overridden by local, dev, process.env
          PORT: "1000", // overridden by local, dev, process.env
        },
        "./.env.local": { // Array path 2 (overrides base)
          FROM_LOCAL: "yes",
          OVERRIDDEN: "local", // overridden by dev, process.env
          SECRET_KEY: "local-secret-long-enough", // overridden by dev, process.env
          FROM_ENV_SPECIFIC: "local", // overridden by dev, process.env
          API_URL: "https://local.url", // overridden by dev, process.env
          PORT: "2000", // overridden by dev, process.env
        },
        "./.env.development": { // Env-specific (overrides array files)
          OVERRIDDEN: "dev", // overridden by process.env
          FROM_ENV_SPECIFIC: "dev-real", // overridden by process.env
          API_URL: "https://dev.url", // overridden by process.env
          PORT: "3000", // overridden by process.env
        },
      });
      const env = createEnv({
        schema: testSchema,
        dotEnvPath: ["./.env.base", "./.env.local"], // Specify array paths
        _internalDotenvConfig: mockedDotenvConfig,
      });

      // Assert values based on the highest precedence source
      expect(env).toEqual(
        expect.objectContaining({
          FROM_BASE: "yes", // Only in .env.base (lowest .env precedence)
          FROM_LOCAL: "yes", // Only in .env.local
          OVERRIDDEN: "process-value", // From process.env
          FROM_ENV_SPECIFIC: "process-override", // From process.env
          SECRET_KEY: "process-secret-key-very-long", // From process.env
          API_URL: "https://required.com/from/process", // From process.env
          NODE_ENV: "development", // From process.env
          PORT: 9999, // From process.env (coerced)
          BOOLEAN_VAR: false, // Default (not in any .env or process.env)
          BASE_URL: "http://localhost", // Default (not in any .env or process.env)
        })
      );

      // Should attempt to load both files in the array, then the env-specific file
      expect(mockedDotenvConfig).toHaveBeenCalledTimes(3);
      expect(mockedDotenvConfig).toHaveBeenCalledWith({ path: "./.env.base" });
      expect(mockedDotenvConfig).toHaveBeenCalledWith({ path: "./.env.local" });
      expect(mockedDotenvConfig).toHaveBeenCalledWith({
        path: "./.env.development",
      });
    });

    it("should perform expansion correctly when using multiple .env paths and env-specific", () => {
      setupProcessEnv({
        NODE_ENV: "development", // Triggers .env.development load
        API_URL: "https://required.com", // Required
        SECRET_KEY: "longenoughsecretkey", // Required
      });
      mockDotenvFiles({
        "./.env.base": { BASE_URL: "https://base.url", VAR_A: "base-A" }, // base defines BASE_URL and VAR_A
        "./.env.local": { VAR_B: "${BASE_URL}/local-B", VAR_A: "local-A" }, // local overrides VAR_A, uses BASE_URL from base
        "./.env.development": { VAR_C: "${VAR_A}-dev" }, // dev uses VAR_A (which was overridden by local)
      });
      const localMockExpander = createLocalMockExpander();

      const env = createEnv({
        schema: testSchema,
        dotEnvPath: ["./.env.base", "./.env.local"], // Array paths
        expandVariables: true, // Enable expansion
        _internalDotenvConfig: mockedDotenvConfig,
        _internalDotenvExpand: localMockExpander,
      });

      expect(env.BASE_URL).toBe("https://base.url"); // From base (.env source)
      expect(env.VAR_A).toBe("local-A"); // From local (.env source, overrides base)
      expect(env.VAR_B).toBe("https://base.url/local-B"); // Expanded using BASE_URL from base (via merged .env values)
      expect(env.VAR_C).toBe("local-A-dev"); // Expanded using VAR_A from local (via merged .env values)

      expect(localMockExpander).toHaveBeenCalledTimes(1);
      // Input to expander should be the merged object from ALL .env files before process.env merge
      expect(localMockExpander).toHaveBeenCalledWith(
        expect.objectContaining({
          parsed: {
            BASE_URL: "https://base.url", // From base
            VAR_A: "local-A", // local overrode base
            VAR_B: "${BASE_URL}/local-B", // From local
            VAR_C: "${VAR_A}-dev", // From dev
            // OVERRIDDEN, FROM_BASE, FROM_LOCAL, FROM_ENV_SPECIFIC etc. would also be in this merged object if present in mocks
          }
        })
      );
    });

    it("should skip non-string paths in dotEnvPath array and warn", () => {
      setupProcessEnv({
        API_URL: "https://required.com", // Required
        SECRET_KEY: "longenoughsecretkey", // Required
      });
      mockDotenvFiles({
        "./.env.valid": { FROM_BASE: "yes" }, // Only this file exists
      });
      const consoleWarnSpy = jest
        .spyOn(console, "warn")
        .mockImplementation(() => { }); // Spy on console.warn

      const env = createEnv({
        schema: testSchema,
        // @ts-expect-error - Deliberately testing invalid input type
        dotEnvPath: ["./.env.valid", 123, null, undefined, "./.env.another_valid"], // Array with valid and invalid entries
        _internalDotenvConfig: mockedDotenvConfig,
      });

      expect(env.FROM_BASE).toBe("yes"); // Value from the valid file should be loaded
      // Should attempt to load only the string paths in the array
      expect(mockedDotenvConfig).toHaveBeenCalledTimes(2);
      expect(mockedDotenvConfig).toHaveBeenCalledWith({ path: "./.env.valid" });
      // The second valid path "./.env.another_valid" doesn't exist in mocks, should trigger ENOENT internally
      expect(mockedDotenvConfig).toHaveBeenCalledWith({ path: "./.env.another_valid" }); // Attempt was made

      // Should warn for each non-string entry
      expect(consoleWarnSpy).toHaveBeenCalledTimes(3);
      expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining("123"));
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining("null")
      );
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining("undefined")
      );

      consoleWarnSpy.mockRestore(); // Clean up the spy
    });

  }); // End Multiple .env Path Tests

}); // End v1.2.0 tests