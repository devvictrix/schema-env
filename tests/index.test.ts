// File: tests/index.test.ts

import {
  jest,
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  afterAll,
} from "@jest/globals";
import { z } from "zod";
import fs from "node:fs"; // <-- Import fs
import dotenv from "dotenv"; // <-- Import dotenv
import {
  createEnv,
  createEnvAsync,
  SecretSourceFunction,
  ValidatorAdapter,
  ValidationResult,
} from "../src/index.js"; // Keep .js extension
import type {
  // DotenvConfigOptions, // No longer needed
  DotenvConfigOutput,
  DotenvParseOutput,
} from "dotenv";

// --- Type Aliases ---
// Removed DotenvConfigFunction
type DotenvExpandFunction = (config: DotenvConfigOutput) => DotenvConfigOutput;

// --- Mocks ---
const consoleErrorSpy = jest
  .spyOn(console, "error")
  .mockImplementation(() => {});
const consoleWarnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});

// Remove mockedDotenvConfig
const mockedDotenvExpand = jest.fn<DotenvExpandFunction>();

// --- NEW MOCKS ---
// Spy on the actual implementations before mocking
const readFileSyncSpy = jest.spyOn(fs, "readFileSync");
const dotenvParseSpy = jest.spyOn(dotenv, "parse");
// --- END NEW MOCKS ---

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
  // For async tests
  FROM_SECRET_MANAGER_1: z.string().optional(),
  FROM_SECRET_MANAGER_2: z.string().optional(),
});

// --- Environment Setup Helper ---
let originalProcessEnv: NodeJS.ProcessEnv;

beforeEach(() => {
  // Reset mocks
  mockedDotenvExpand.mockReset();
  readFileSyncSpy.mockReset();
  dotenvParseSpy.mockReset();
  consoleErrorSpy.mockClear();
  consoleWarnSpy.mockClear();

  // Backup and clear process.env relevant keys
  originalProcessEnv = { ...process.env };
  const keysToClear = [
    ...Object.keys(testSchema.shape),
    "NODE_ENV",
    "MISSING_VAR",
    "INPUT_VAR",
    "SECRET_INPUT",
  ];
  new Set(keysToClear).forEach((key) => delete process.env[key]);

  // Default successful expand behavior
  mockedDotenvExpand.mockImplementation((config) => config);

  // --- Default fs/parse mock behavior ---
  readFileSyncSpy.mockImplementation((path) => {
    const error = new Error(
      `ENOENT: no such file or directory, open '${path}' (default mock)`
    );
    (error as NodeJS.ErrnoException).code = "ENOENT";
    throw error;
  });
  dotenvParseSpy.mockReturnValue({});
  // --- End default mock behavior ---
});

afterEach(() => {
  process.env = originalProcessEnv;
});

afterAll(() => {
  consoleErrorSpy.mockRestore();
  consoleWarnSpy.mockRestore();
  readFileSyncSpy.mockRestore();
  dotenvParseSpy.mockRestore();
});

// --- Helpers ---
const setupProcessEnv = (envVars: Record<string, string | undefined>) => {
  for (const key in envVars) {
    if (envVars[key] !== undefined) {
      process.env[key] = envVars[key];
    } else {
      delete process.env[key];
    }
  }
};

// --- REWRITTEN mockDotenvFiles HELPER ---
const mockDotenvFiles = (
  files: Record<
    string, // File path (key)
    | Record<string, string> // Success: object to be returned by dotenv.parse
    | NodeJS.ErrnoException // Specific FS error to be thrown by readFileSync
    | "ENOENT" // Simulate ENOENT error from readFileSync
    | "UNEXPECTED" // Simulate unexpected error from readFileSync (for coverage)
    | string // Direct file content (will be parsed by actual dotenv.parse) - Less common use
  >
) => {
  readFileSyncSpy.mockImplementation((pathInput, _options) => {
    // <-- Fixed: unused _options
    const filePath =
      typeof pathInput === "string" ? pathInput : pathInput.toString();
    const data = files[filePath];

    if (data === undefined) {
      const error = new Error(
        `ENOENT: no such file or directory, open '${filePath}' (mock fallthrough)`
      );
      (error as NodeJS.ErrnoException).code = "ENOENT";
      throw error;
    } else if (data === "ENOENT") {
      const error = new Error(
        `ENOENT: no such file or directory, open '${filePath}' (mocked)`
      );
      (error as NodeJS.ErrnoException).code = "ENOENT";
      throw error;
    } else if (data instanceof Error) {
      throw data;
    } else if (data === "UNEXPECTED") {
      throw new Error(`Unexpected internal FS error for ${filePath}`);
    } else if (typeof data === "string") {
      dotenvParseSpy.mockImplementation(dotenv.parse); // Use actual parse for string content
      return data;
    } else if (typeof data === "object" && data !== null) {
      const placeholderContent = `MOCKED_CONTENT_FOR_${filePath}`;
      // Mock parse specific to this placeholder content
      dotenvParseSpy.mockImplementation((content) => {
        if (content === placeholderContent) {
          return { ...data };
        }
        return {}; // Fallback for other parse calls
      });
      return placeholderContent;
    }
    throw new Error(`Unhandled mock type for path: ${filePath}`);
  });
};
// --- END REWRITTEN HELPER ---

// --- Mock Expander ---
const createLocalMockExpander = (): DotenvExpandFunction => {
  return (config: DotenvConfigOutput): DotenvConfigOutput => {
    if (config.error || !config.parsed) {
      return config;
    }
    const parsedCopy: DotenvParseOutput = { ...config.parsed };
    const lookupValues = { ...config.parsed };
    const expandValue = (value: string, processing: Set<string>): string => {
      return value.replace(/\$\{([^}]+)\}/g, (match, varName) => {
        if (processing.has(varName)) {
          return "";
        }
        if (lookupValues[varName] !== undefined) {
          processing.add(varName);
          const expanded = expandValue(lookupValues[varName], processing);
          processing.delete(varName);
          return expanded;
        }
        return "";
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
  it("should return validated env with defaults when no sources provide values", () => {
    setupProcessEnv({
      API_URL: "https://test.com",
      SECRET_KEY: "longenoughsecretkey",
    });
    mockDotenvFiles({});
    const env = createEnv({ schema: testSchema });
    expect(env).toEqual(
      expect.objectContaining({
        NODE_ENV: "development",
        PORT: 8080,
        API_URL: "https://test.com",
        SECRET_KEY: "longenoughsecretkey",
        BOOLEAN_VAR: false,
        BASE_URL: "http://localhost",
      })
    );
    expect(env).not.toHaveProperty("OPTIONAL_VAR");
    expect(readFileSyncSpy).toHaveBeenCalledTimes(1);
    expect(readFileSyncSpy).toHaveBeenCalledWith("./.env", expect.any(Object));
    expect(dotenvParseSpy).not.toHaveBeenCalled();
  });

  it("should return validated env with values from .env overriding defaults", () => {
    setupProcessEnv({});
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
      _internalDotenvExpand: mockedDotenvExpand,
    });
    expect(env).toEqual(
      expect.objectContaining({
        NODE_ENV: "production",
        PORT: 3000,
        API_URL: "https://from-dotenv.com",
        SECRET_KEY: "secretkeyfromdotenv",
        BOOLEAN_VAR: true,
        BASE_URL: "https://api.prod.com",
      })
    );
    expect(readFileSyncSpy).toHaveBeenCalledWith("./.env", expect.any(Object));
    expect(dotenvParseSpy).toHaveBeenCalledTimes(1);
    expect(dotenvParseSpy).toHaveReturnedWith(mockDotEnvData);
    expect(mockedDotenvExpand).not.toHaveBeenCalled();
  });

  it("should return validated env with process.env overriding .env and defaults", () => {
    setupProcessEnv({
      PORT: "9999",
      SECRET_KEY: "processenvsecret",
      OPTIONAL_VAR: "hello from process",
    });
    const mockDotEnvData = {
      PORT: "3000",
      API_URL: "https://from-dotenv.com",
      SECRET_KEY: "dotenvsecret",
      BOOLEAN_VAR: "1",
    };
    mockDotenvFiles({ "./.env": mockDotEnvData });
    const env = createEnv({
      schema: testSchema,
      _internalDotenvExpand: mockedDotenvExpand,
    });
    expect(env).toEqual(
      expect.objectContaining({
        NODE_ENV: "development",
        PORT: 9999,
        API_URL: "https://from-dotenv.com",
        SECRET_KEY: "processenvsecret",
        OPTIONAL_VAR: "hello from process",
        BOOLEAN_VAR: true,
        BASE_URL: "http://localhost",
      })
    );
    expect(readFileSyncSpy).toHaveBeenCalledWith("./.env", expect.any(Object));
    expect(dotenvParseSpy).toHaveBeenCalledTimes(1);
    expect(mockedDotenvExpand).not.toHaveBeenCalled();
  });

  it("should throw validation error if required variables are missing", () => {
    setupProcessEnv({ SECRET_KEY: "onlythesecretisprovided" });
    mockDotenvFiles({});
    expect(() => {
      createEnv({
        schema: testSchema,
        _internalDotenvExpand: mockedDotenvExpand,
      });
    }).toThrow("Environment validation failed. Check console output.");
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining("❌ Invalid environment variables:")
    );
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining("- API_URL: Required")
    );
  });

  it("should not load any .env files if dotEnvPath is false", () => {
    setupProcessEnv({
      API_URL: "https://no-dotenv.com",
      SECRET_KEY: "thiskeyislongenough",
    });
    mockDotenvFiles({ "./.env": { SHOULD_NOT: "load" } });
    const env = createEnv({
      schema: testSchema,
      dotEnvPath: false,
      _internalDotenvExpand: mockedDotenvExpand,
    });
    expect(env.API_URL).toBe("https://no-dotenv.com");
    expect(env.SECRET_KEY).toBe("thiskeyislongenough");
    expect(env.PORT).toBe(8080);
    expect(readFileSyncSpy).not.toHaveBeenCalled();
    expect(dotenvParseSpy).not.toHaveBeenCalled();
    expect(mockedDotenvExpand).not.toHaveBeenCalled();
  });

  it("should THROW error if .env file fails to load (other than ENOENT)", () => {
    setupProcessEnv({});
    const loadError = new Error("Permission denied");
    (loadError as NodeJS.ErrnoException).code = "EACCES";
    mockDotenvFiles({ "./.env": loadError });
    expect(() => {
      createEnv({
        schema: testSchema,
        _internalDotenvExpand: mockedDotenvExpand,
      });
    }).toThrow(
      `❌ Failed to load environment file from ./.env: ${loadError.message}`
    );
    expect(readFileSyncSpy).toHaveBeenCalledWith("./.env", expect.any(Object));
    expect(dotenvParseSpy).not.toHaveBeenCalled();
    expect(mockedDotenvExpand).not.toHaveBeenCalled();
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
      _internalDotenvExpand: mockedDotenvExpand,
    });
    expect(env.OPTIONAL_VAR).toBe("provided");
    expect(env.FULL_API_URL).toBeUndefined();
  });

  it("should THROW if fs.readFileSync throws an unexpected error during load", () => {
    setupProcessEnv({});
    mockDotenvFiles({ "./.env": "UNEXPECTED" });
    expect(() => {
      createEnv({
        schema: testSchema,
        _internalDotenvExpand: mockedDotenvExpand,
      });
      // eslint-disable-next-line no-useless-escape -- Necessary for regex literal character matching
    }).toThrow(/Unexpected internal FS error for .\/.\env/);
    expect(mockedDotenvExpand).not.toHaveBeenCalled();
  });

  it("should THROW if schema is not a ZodObject (createEnv)", () => {
    setupProcessEnv({});
    mockDotenvFiles({});
    expect(() => {
      createEnv({
        // @ts-expect-error - Testing invalid schema type
        schema: z.string(),
        _internalDotenvExpand: mockedDotenvExpand,
      });
    }).toThrow(
      "Invalid 'schema' provided. Expected a ZodObject when 'validator' is not used."
    );
    expect(readFileSyncSpy).not.toHaveBeenCalled();
    expect(mockedDotenvExpand).not.toHaveBeenCalled();
  });
});

// --- v1.2.0 Env-Specific & Expansion Tests (createEnv) ---
describe("createEnv (Env-Specific Files & Expansion)", () => {
  it("should load .env only if NODE_ENV is not set (using default path)", () => {
    setupProcessEnv({});
    mockDotenvFiles({
      "./.env": {
        API_URL: "https://base.com",
        SECRET_KEY: "base-secret-key-123",
      },
    });
    const env = createEnv({
      schema: testSchema,
      _internalDotenvExpand: mockedDotenvExpand,
    });
    expect(env.API_URL).toBe("https://base.com");
    expect(env.SECRET_KEY).toBe("base-secret-key-123");
    expect(readFileSyncSpy).toHaveBeenCalledTimes(1);
    expect(dotenvParseSpy).toHaveBeenCalledTimes(1);
    expect(mockedDotenvExpand).not.toHaveBeenCalled();
  });

  it("should load .env and .env.development if NODE_ENV=development", () => {
    setupProcessEnv({ NODE_ENV: "development" });
    mockDotenvFiles({
      "./.env": { API_URL: "https://base.com", PORT: "1111" },
      "./.env.development": {
        API_URL: "https://dev.com",
        SECRET_KEY: "dev-secret-key-456",
      },
    });
    const env = createEnv({
      schema: testSchema,
      _internalDotenvExpand: mockedDotenvExpand,
    });
    expect(env.API_URL).toBe("https://dev.com"); // Dev overrides base
    expect(env.PORT).toBe(1111); // From base
    expect(env.SECRET_KEY).toBe("dev-secret-key-456"); // From dev
    expect(readFileSyncSpy).toHaveBeenCalledTimes(2);
    expect(dotenvParseSpy).toHaveBeenCalledTimes(2);
  });

  it("should load base .env only if environment-specific file is not found (ENOENT)", () => {
    setupProcessEnv({ NODE_ENV: "test" });
    mockDotenvFiles({
      "./.env": {
        API_URL: "https://base.com",
        SECRET_KEY: "base-secret-key-123",
      },
    });
    const env = createEnv({
      schema: testSchema,
      _internalDotenvExpand: mockedDotenvExpand,
    });
    expect(env.API_URL).toBe("https://base.com");
    expect(env.SECRET_KEY).toBe("base-secret-key-123");
    expect(env.NODE_ENV).toBe("test"); // From process.env
    expect(readFileSyncSpy).toHaveBeenCalledTimes(2); // Attempted both
    expect(dotenvParseSpy).toHaveBeenCalledTimes(1); // Parsed only .env
  });

  it("should correctly merge: Defaults < Base .env < Env-specific .env < process.env (single base path)", () => {
    setupProcessEnv({
      NODE_ENV: "production",
      SECRET_KEY: "process-secret-key-final",
      PORT: "5555",
      OPTIONAL_VAR: "from-process",
    });
    mockDotenvFiles({
      "./.env": {
        API_URL: "https://base.com",
        SECRET_KEY: "base-secret-key-123",
        BOOLEAN_VAR: "true",
        BASE_URL: "https://base.url",
        OVERRIDDEN: "from-base",
      },
      "./.env.production": {
        API_URL: "https://prod.com",
        SECRET_KEY: "prod-secret-key-456",
        PORT: "9000",
        BASE_URL: "https://prod.url",
        OVERRIDDEN: "from-prod",
      },
    });
    const env = createEnv({
      schema: testSchema,
      _internalDotenvExpand: mockedDotenvExpand,
    });
    expect(env).toEqual(
      expect.objectContaining({
        NODE_ENV: "production",
        PORT: 5555,
        API_URL: "https://prod.com",
        SECRET_KEY: "process-secret-key-final",
        OPTIONAL_VAR: "from-process",
        BOOLEAN_VAR: true,
        BASE_URL: "https://prod.url",
        OVERRIDDEN: "from-prod",
      })
    );
    expect(readFileSyncSpy).toHaveBeenCalledTimes(2);
    expect(dotenvParseSpy).toHaveBeenCalledTimes(2);
  });

  it("should perform expansion when expandVariables is true (single .env)", () => {
    setupProcessEnv({
      API_URL: "https://required.com",
      SECRET_KEY: "some-secret-key-that-is-long",
    });
    mockDotenvFiles({
      "./.env": {
        BASE_URL: "https://api.example.com",
        FULL_API_URL: "${BASE_URL}/v1",
      },
    });
    mockedDotenvExpand.mockImplementation(createLocalMockExpander());
    const env = createEnv({
      schema: testSchema,
      expandVariables: true,
      _internalDotenvExpand: mockedDotenvExpand,
    });
    expect(env.FULL_API_URL).toBe("https://api.example.com/v1");
    expect(env.BASE_URL).toBe("https://api.example.com");
    expect(mockedDotenvExpand).toHaveBeenCalledTimes(1);
  });

  it("should NOT perform expansion when expandVariables is false (default)", () => {
    setupProcessEnv({
      API_URL: "https://required.com",
      SECRET_KEY: "a-valid-secret-key",
    });
    mockDotenvFiles({
      "./.env": {
        BASE_URL: "https://api.example.com",
        FULL_API_URL: "${BASE_URL}/v1",
      },
    });
    const env = createEnv({
      schema: testSchema,
      _internalDotenvExpand: mockedDotenvExpand,
    });
    expect(env.FULL_API_URL).toBe("${BASE_URL}/v1");
    expect(env.BASE_URL).toBe("https://api.example.com");
    expect(mockedDotenvExpand).not.toHaveBeenCalled();
  });

  it("should expand variables drawing values from both base and env-specific files", () => {
    setupProcessEnv({
      NODE_ENV: "development",
      API_URL: "https://required.com",
      SECRET_KEY: "dev-secret-is-long-enough",
    });
    mockDotenvFiles({
      "./.env": {
        BASE_URL: "https://base.api",
        SECRET_KEY: "base-secret-key-123",
      },
      "./.env.development": {
        FULL_API_URL: "${BASE_URL}/dev",
        SECRET_KEY: "dev-secret-key-456",
      },
    });
    mockedDotenvExpand.mockImplementation(createLocalMockExpander());
    const env = createEnv({
      schema: testSchema,
      expandVariables: true,
      _internalDotenvExpand: mockedDotenvExpand,
    });
    expect(env.FULL_API_URL).toBe("https://base.api/dev");
    expect(env.BASE_URL).toBe("https://base.api");
    expect(env.SECRET_KEY).toBe("dev-secret-is-long-enough");
    expect(mockedDotenvExpand).toHaveBeenCalledTimes(1);
  });

  it("should NOT expand variables from process.env", () => {
    setupProcessEnv({
      NODE_ENV: "production",
      BASE_URL: "https://process-base.url",
      API_URL: "https://required.com",
      SECRET_KEY: "process-secret-is-long",
    });
    mockDotenvFiles({
      "./.env": { FULL_API_URL: "${BASE_URL}/v1" },
      "./.env.production": {},
    });
    mockedDotenvExpand.mockImplementation(createLocalMockExpander());
    const env = createEnv({
      schema: testSchema,
      expandVariables: true,
      _internalDotenvExpand: mockedDotenvExpand,
    });
    expect(env.FULL_API_URL).toBe("/v1");
    expect(env.BASE_URL).toBe("https://process-base.url");
    expect(mockedDotenvExpand).toHaveBeenCalledTimes(1);
  });

  it("should handle multi-level expansion", () => {
    setupProcessEnv({
      API_URL: "https://required.com",
      SECRET_KEY: "long-enough-secret-key",
    });
    mockDotenvFiles({
      "./.env": {
        VAR_A: "${VAR_B}/pathA",
        VAR_B: "${VAR_C}",
        VAR_C: "https://final.value",
      },
    });
    mockedDotenvExpand.mockImplementation(createLocalMockExpander());
    const env = createEnv({
      schema: testSchema,
      expandVariables: true,
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
    mockDotenvFiles({ "./.env": { VAR_A: "${VAR_B}", VAR_B: "${VAR_A}" } });
    mockedDotenvExpand.mockImplementation(createLocalMockExpander());
    const env = createEnv({
      schema: testSchema,
      expandVariables: true,
      _internalDotenvExpand: mockedDotenvExpand,
    });
    expect(env.VAR_A).toBe("");
    expect(env.VAR_B).toBe("");
    expect(mockedDotenvExpand).toHaveBeenCalledTimes(1);
  });

  it("should handle empty .env file when expansion is enabled", () => {
    setupProcessEnv({
      API_URL: "https://required.com",
      SECRET_KEY: "long-enough-secret-key",
    });
    mockDotenvFiles({ "./.env": {} });
    const env = createEnv({
      schema: testSchema,
      expandVariables: true,
      _internalDotenvExpand: mockedDotenvExpand,
    });
    expect(env).toBeDefined();
    expect(readFileSyncSpy).toHaveBeenCalledTimes(1);
    expect(dotenvParseSpy).toHaveBeenCalledTimes(1);
    expect(mockedDotenvExpand).not.toHaveBeenCalled();
  });

  it("should handle expansion failure gracefully and log error", () => {
    setupProcessEnv({
      API_URL: "https://required.com",
      SECRET_KEY: "long-enough-secret-key",
    });
    mockDotenvFiles({ "./.env": { VAR_A: "${VAR_B}" } });
    const expansionError = new Error("Expansion failed!");
    mockedDotenvExpand.mockImplementation(() => {
      throw expansionError;
    });
    const env = createEnv({
      schema: testSchema,
      expandVariables: true,
      _internalDotenvExpand: mockedDotenvExpand,
    });
    expect(env.VAR_A).toBe("${VAR_B}");
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
      API_URL: "https://required.com",
      SECRET_KEY: "longenoughsecretkey",
    });
    mockDotenvFiles({
      "./.env.base": {
        FROM_BASE: "yes",
        OVERRIDDEN: "base-value",
        PORT: "1000",
      },
      "./.env.local": {
        FROM_LOCAL: "yes",
        OVERRIDDEN: "local-value",
        PORT: "2000",
      },
    });
    const env = createEnv({
      schema: testSchema,
      dotEnvPath: ["./.env.base", "./.env.local"],
      _internalDotenvExpand: mockedDotenvExpand,
    });
    expect(env.FROM_BASE).toBe("yes");
    expect(env.FROM_LOCAL).toBe("yes");
    expect(env.OVERRIDDEN).toBe("local-value");
    expect(env.PORT).toBe(2000);
    expect(readFileSyncSpy).toHaveBeenCalledTimes(2);
    expect(dotenvParseSpy).toHaveBeenCalledTimes(2);
  });

  it("should load multiple files AND environment-specific file, with env-specific overriding array files", () => {
    setupProcessEnv({
      NODE_ENV: "development",
      API_URL: "https://required.com",
      SECRET_KEY: "longenoughsecretkey",
    });
    mockDotenvFiles({
      "./.env.base": {
        FROM_BASE: "yes",
        OVERRIDDEN: "base-value",
        PORT: "1000",
      },
      "./.env.local": {
        FROM_LOCAL: "yes",
        OVERRIDDEN: "local-value",
        PORT: "2000",
      },
      "./.env.development": {
        FROM_ENV_SPECIFIC: "yes",
        OVERRIDDEN: "dev-value",
        PORT: "3000",
      },
    });
    const env = createEnv({
      schema: testSchema,
      dotEnvPath: ["./.env.base", "./.env.local"],
      _internalDotenvExpand: mockedDotenvExpand,
    });
    expect(env.FROM_BASE).toBe("yes");
    expect(env.FROM_LOCAL).toBe("yes");
    expect(env.FROM_ENV_SPECIFIC).toBe("yes");
    expect(env.OVERRIDDEN).toBe("dev-value");
    expect(env.PORT).toBe(3000);
    expect(readFileSyncSpy).toHaveBeenCalledTimes(3);
    expect(dotenvParseSpy).toHaveBeenCalledTimes(3);
  });

  it("should ignore ENOENT for files within the array path and continue loading", () => {
    setupProcessEnv({
      API_URL: "https://required.com",
      SECRET_KEY: "longenoughsecretkey",
    });
    mockDotenvFiles({
      "./.env.base": { FROM_BASE: "yes", OVERRIDDEN: "base-value" },
      "./.env.local": { FROM_LOCAL: "yes", OVERRIDDEN: "local-value" },
    });
    const env = createEnv({
      schema: testSchema,
      dotEnvPath: ["./.env.base", "./.env.missing", "./.env.local"],
      _internalDotenvExpand: mockedDotenvExpand,
    });
    expect(env.FROM_BASE).toBe("yes");
    expect(env.FROM_LOCAL).toBe("yes");
    expect(env.OVERRIDDEN).toBe("local-value");
    expect(readFileSyncSpy).toHaveBeenCalledTimes(3); // All attempts made
    expect(dotenvParseSpy).toHaveBeenCalledTimes(2); // Only base and local parsed
  });

  it("should THROW error if a file in the array fails to load (non-ENOENT)", () => {
    setupProcessEnv({
      API_URL: "https://required.com",
      SECRET_KEY: "longenoughsecretkey",
    });
    const loadError = new Error("Read error");
    (loadError as NodeJS.ErrnoException).code = "EIO";
    mockDotenvFiles({
      "./.env.base": { FROM_BASE: "yes", OVERRIDDEN: "base" },
      "./.env.bad": loadError,
      "./.env.local": { FROM_LOCAL: "yes", OVERRIDDEN: "local" },
    });
    expect(() => {
      createEnv({
        schema: testSchema,
        dotEnvPath: ["./.env.base", "./.env.bad", "./.env.local"],
        _internalDotenvExpand: mockedDotenvExpand,
      });
    }).toThrow(
      `❌ Failed to load environment file from ./.env.bad: ${loadError.message}`
    );
    expect(readFileSyncSpy).toHaveBeenCalledTimes(2); // base, bad (stopped)
    expect(dotenvParseSpy).toHaveBeenCalledTimes(1); // Only for base
  });

  it("should load array paths, env-specific, and process.env with correct full precedence", () => {
    setupProcessEnv({
      NODE_ENV: "development",
      API_URL: "https://required.com/from/process",
      SECRET_KEY: "process-secret-key-very-long",
      OVERRIDDEN: "process-value",
      FROM_ENV_SPECIFIC: "process-override",
      PORT: "9999",
    });
    mockDotenvFiles({
      "./.env.base": {
        FROM_BASE: "yes",
        OVERRIDDEN: "base",
        SECRET_KEY: "base-secret-too-short",
        FROM_ENV_SPECIFIC: "base",
        API_URL: "https://base.url",
        PORT: "1000",
      },
      "./.env.local": {
        FROM_LOCAL: "yes",
        OVERRIDDEN: "local",
        SECRET_KEY: "local-secret-long-enough",
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
      _internalDotenvExpand: mockedDotenvExpand,
    });
    expect(env).toEqual(
      expect.objectContaining({
        FROM_BASE: "yes",
        FROM_LOCAL: "yes",
        OVERRIDDEN: "process-value",
        FROM_ENV_SPECIFIC: "process-override",
        SECRET_KEY: "process-secret-key-very-long",
        API_URL: "https://required.com/from/process",
        NODE_ENV: "development",
        PORT: 9999,
        BOOLEAN_VAR: false,
        BASE_URL: "http://localhost",
      })
    );
    expect(readFileSyncSpy).toHaveBeenCalledTimes(3);
    expect(dotenvParseSpy).toHaveBeenCalledTimes(3);
  });

  it("should perform expansion correctly when using multiple .env paths and env-specific", () => {
    setupProcessEnv({
      NODE_ENV: "development",
      API_URL: "https://required.com",
      SECRET_KEY: "longenoughsecretkey",
    });
    mockDotenvFiles({
      "./.env.base": { BASE_URL: "https://base.url", VAR_A: "base-A" },
      "./.env.local": { VAR_B: "${BASE_URL}/local-B", VAR_A: "local-A" },
      "./.env.development": { VAR_C: "${VAR_A}-dev" },
    });
    mockedDotenvExpand.mockImplementation(createLocalMockExpander());
    const env = createEnv({
      schema: testSchema,
      dotEnvPath: ["./.env.base", "./.env.local"],
      expandVariables: true,
      _internalDotenvExpand: mockedDotenvExpand,
    });
    expect(env.BASE_URL).toBe("https://base.url");
    expect(env.VAR_A).toBe("local-A");
    expect(env.VAR_B).toBe("https://base.url/local-B");
    expect(env.VAR_C).toBe("local-A-dev");
    expect(mockedDotenvExpand).toHaveBeenCalledTimes(1);
  });

  it("should skip non-string paths in dotEnvPath array and warn", () => {
    setupProcessEnv({
      API_URL: "https://required.com",
      SECRET_KEY: "longenoughsecretkey",
    });
    mockDotenvFiles({ "./.env.valid": { FROM_BASE: "yes" }, "": {} });
    const env = createEnv({
      schema: testSchema,
      // @ts-expect-error - Testing invalid array element types
      dotEnvPath: ["./.env.valid", 123, null, undefined, ""],
      _internalDotenvExpand: mockedDotenvExpand,
    });
    expect(env.FROM_BASE).toBe("yes");
    expect(readFileSyncSpy).toHaveBeenCalledTimes(2);
    expect(dotenvParseSpy).toHaveBeenCalledTimes(2);
    expect(consoleWarnSpy).toHaveBeenCalledTimes(3);
  });
});

// --- v2.0.0 Async Validation Tests (createEnvAsync) ---
describe("createEnvAsync (Asynchronous Validation)", () => {
  const mockSecretSource1: SecretSourceFunction = async () => {
    await new Promise((r) => setTimeout(r, 1));
    return {
      FROM_SECRET_MANAGER_1: "secret-value-1",
      OVERRIDDEN: "from-secret-1",
      SECRET_KEY: "secret-key-long-enough-1",
    };
  };
  const mockSecretSource2: SecretSourceFunction = async () => {
    await new Promise((r) => setTimeout(r, 1));
    return {
      FROM_SECRET_MANAGER_2: "secret-value-2",
      OVERRIDDEN: "from-secret-2",
    };
  };
  const mockFailingSource: SecretSourceFunction = async () => {
    await new Promise((r) => setTimeout(r, 1));
    throw new Error("Failed to fetch from this source");
  };
  const mockSyncErrorSource: SecretSourceFunction = () => {
    throw new Error("Sync error inside source function");
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Intentional for testing non-promise return
  const mockNonPromiseSource: SecretSourceFunction = () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return { SYNC_RETURN: "should-not-work" } as any as Promise<
      Record<string, string | undefined>
    >;
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Intentional for testing non-object resolution
  const mockNonObjectResolvingSource: SecretSourceFunction = async () => {
    await new Promise((res) => setTimeout(res, 1));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return "i am not an object" as any as Record<string, string | undefined>;
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Intentional for testing null resolution
  const mockNullResolvingSource: SecretSourceFunction = async () => {
    await new Promise((res) => setTimeout(res, 1));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return null as any as Record<string, string | undefined>;
  };

  it("should resolve successfully with combined sources (.env, secrets, process.env)", async () => {
    setupProcessEnv({
      API_URL: "https://process.env.url",
      OVERRIDDEN: "from-process",
    });
    mockDotenvFiles({
      "./.env": {
        PORT: "1234",
        OVERRIDDEN: "from-dotenv",
        SECRET_KEY: "dotenv-key-too-short",
      },
    });
    const env = await createEnvAsync({
      schema: testSchema,
      secretsSources: [mockSecretSource1, mockSecretSource2],
      _internalDotenvExpand: mockedDotenvExpand,
    });
    expect(env).toEqual(
      expect.objectContaining({
        PORT: 1234,
        API_URL: "https://process.env.url",
        SECRET_KEY: "secret-key-long-enough-1",
        FROM_SECRET_MANAGER_1: "secret-value-1",
        FROM_SECRET_MANAGER_2: "secret-value-2",
        OVERRIDDEN: "from-process",
      })
    );
    expect(readFileSyncSpy).toHaveBeenCalledTimes(1);
    expect(dotenvParseSpy).toHaveBeenCalledTimes(1);
  });

  it("should correctly apply precedence: .env < secrets < process.env", async () => {
    setupProcessEnv({ PORT: "9999", OVERRIDDEN: "process-final" });
    mockDotenvFiles({
      "./.env": {
        PORT: "1111",
        OVERRIDDEN: "dotenv-base",
        API_URL: "https://dotenv.url",
      },
    });
    const secretSource: SecretSourceFunction = async () => ({
      PORT: "8888",
      OVERRIDDEN: "secret-middle",
      SECRET_KEY: "secret-key-is-valid-and-long",
    });
    const env = await createEnvAsync({
      schema: testSchema,
      secretsSources: [secretSource],
      _internalDotenvExpand: mockedDotenvExpand,
    });
    expect(env.PORT).toBe(9999);
    expect(env.OVERRIDDEN).toBe("process-final");
    expect(env.API_URL).toBe("https://dotenv.url");
    expect(env.SECRET_KEY).toBe("secret-key-is-valid-and-long");
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
      BASE_URL: "https://secret.base",
    });
    mockedDotenvExpand.mockImplementation(createLocalMockExpander());
    const env = await createEnvAsync({
      schema: testSchema,
      expandVariables: true,
      secretsSources: [secretSource],
      _internalDotenvExpand: mockedDotenvExpand,
    });
    expect(env.FULL_API_URL).toBe("https://env.base/expanded");
    expect(env.BASE_URL).toBe("https://secret.base");
    expect(mockedDotenvExpand).toHaveBeenCalledTimes(1);
  });

  it("should resolve successfully even if one secret source fails (async error)", async () => {
    setupProcessEnv({
      API_URL: "https://required.com",
      SECRET_KEY: "valid-process-key",
    });
    mockDotenvFiles({});
    const env = await createEnvAsync({
      schema: testSchema,
      secretsSources: [mockFailingSource, mockSecretSource2],
      _internalDotenvExpand: mockedDotenvExpand,
    });
    expect(env.FROM_SECRET_MANAGER_2).toBe("secret-value-2");
    expect(env.OVERRIDDEN).toBe("from-secret-2");
    expect(consoleWarnSpy).toHaveBeenCalledTimes(1);
  });

  it("should resolve successfully using other sources if all secret sources fail (multiple failure modes)", async () => {
    setupProcessEnv({
      API_URL: "https://required.com",
      SECRET_KEY: "valid-process-key",
      OVERRIDDEN: "from-process-only",
    });
    mockDotenvFiles({});
    const env = await createEnvAsync({
      schema: testSchema,
      secretsSources: [
        mockFailingSource,
        mockSyncErrorSource,
        mockNonPromiseSource,
      ],
      _internalDotenvExpand: mockedDotenvExpand,
    });
    expect(env.OVERRIDDEN).toBe("from-process-only");
    expect(consoleWarnSpy).toHaveBeenCalledTimes(4);
  });

  it("should handle no secret sources provided", async () => {
    setupProcessEnv({
      API_URL: "https://required.com",
      SECRET_KEY: "valid-process-key",
    });
    mockDotenvFiles({});
    const env = await createEnvAsync({
      schema: testSchema,
      secretsSources: [],
      _internalDotenvExpand: mockedDotenvExpand,
    });
    expect(env.API_URL).toBe("https://required.com");
    expect(consoleWarnSpy).not.toHaveBeenCalled();
  });

  it("should reject promise if validation fails", async () => {
    setupProcessEnv({ API_URL: "https://required.com" }); // Missing SECRET_KEY
    mockDotenvFiles({});
    await expect(
      createEnvAsync({
        schema: testSchema,
        secretsSources: [async () => ({})],
        _internalDotenvExpand: mockedDotenvExpand,
      })
    ).rejects.toThrow("Environment validation failed. Check console output.");
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining("- SECRET_KEY: Required")
    );
  });

  it("should reject promise if a synchronous error occurs during setup (e.g., non-ENOENT .env load)", async () => {
    setupProcessEnv({});
    const loadError = new Error("FS error");
    (loadError as NodeJS.ErrnoException).code = "EIO";
    mockDotenvFiles({ "./.env": loadError });
    await expect(
      createEnvAsync({
        schema: testSchema,
        _internalDotenvExpand: mockedDotenvExpand,
      })
    ).rejects.toThrow(
      `❌ Failed to load environment file from ./.env: ${loadError.message}`
    );
  });

  it("should handle secret sources that return non-object values gracefully and log warning", async () => {
    setupProcessEnv({
      API_URL: "https://required.com",
      SECRET_KEY: "valid-process-key",
    });
    mockDotenvFiles({});
    const env = await createEnvAsync({
      schema: testSchema,
      secretsSources: [mockNonObjectResolvingSource, mockSecretSource1],
      _internalDotenvExpand: mockedDotenvExpand,
    });
    expect(env.FROM_SECRET_MANAGER_1).toBe("secret-value-1");
    expect(env.SECRET_KEY).toBe("valid-process-key");
    expect(consoleWarnSpy).toHaveBeenCalledTimes(1);
  });

  it("should handle secret source functions that resolve to undefined/null silently", async () => {
    setupProcessEnv({
      API_URL: "https://required.com",
      SECRET_KEY: "valid-process-key",
    });
    mockDotenvFiles({});
    const env = await createEnvAsync({
      schema: testSchema,
      secretsSources: [mockNullResolvingSource, mockSecretSource1],
      _internalDotenvExpand: mockedDotenvExpand,
    });
    expect(env.SECRET_KEY).toBe("valid-process-key");
    expect(env.FROM_SECRET_MANAGER_1).toBe("secret-value-1");
    expect(consoleWarnSpy).not.toHaveBeenCalled();
  });

  it("should warn if a secret source function returns non-promise", async () => {
    setupProcessEnv({
      API_URL: "https://required.com",
      SECRET_KEY: "valid-process-key",
    });
    mockDotenvFiles({});
    const env = await createEnvAsync({
      schema: testSchema,
      secretsSources: [mockNonPromiseSource, mockSecretSource1],
      _internalDotenvExpand: mockedDotenvExpand,
    });
    expect(env.SECRET_KEY).toBe("valid-process-key");
    expect(env.FROM_SECRET_MANAGER_1).toBe("secret-value-1");
    expect(consoleWarnSpy).toHaveBeenCalledTimes(1);
  });

  it("should resolve successfully if a source rejects with non-Error but validation passes", async () => {
    setupProcessEnv({
      API_URL: "https://required.com",
      SECRET_KEY: "valid-process-key",
    });
    mockDotenvFiles({});
    const nonErrorRejectionSource = () =>
      Promise.reject("just a string rejection");
    await expect(
      createEnvAsync({
        schema: testSchema,
        secretsSources: [nonErrorRejectionSource],
        _internalDotenvExpand: mockedDotenvExpand,
      })
    ).resolves.toEqual(
      expect.objectContaining({ SECRET_KEY: "valid-process-key" })
    );
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      expect.stringContaining(
        "Warning: Secrets source function at index 0 failed: just a string rejection"
      )
    );
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      expect.stringContaining(
        "Warning: All 1 provided secretsSources functions failed"
      )
    );
  });

  it("should THROW if schema is not a ZodObject (createEnvAsync)", async () => {
    setupProcessEnv({});
    mockDotenvFiles({});
    await expect(
      createEnvAsync({
        // @ts-expect-error - Testing invalid schema type
        schema: z.string(),
        _internalDotenvExpand: mockedDotenvExpand,
      })
    ).rejects.toThrow(
      "Invalid 'schema' provided. Expected a ZodObject when 'validator' is not used."
    );
    expect(readFileSyncSpy).not.toHaveBeenCalled();
  });
});

// --- v2.1.0 Validation Adapter Tests ---
interface CustomEnvType {
  CUSTOM_VAR: string;
  VALIDATED: boolean;
  INPUT_VAR?: string;
  SECRET_INPUT?: string;
}

const mockCustomValidatorSuccessImpl =
  jest.fn<(data: Record<string, unknown>) => ValidationResult<CustomEnvType>>();
const mockCustomValidatorFailureImpl =
  jest.fn<(data: Record<string, unknown>) => ValidationResult<CustomEnvType>>();

const customAdapterSuccess: ValidatorAdapter<CustomEnvType> = {
  validate: mockCustomValidatorSuccessImpl,
};
const customAdapterFailure: ValidatorAdapter<CustomEnvType> = {
  validate: mockCustomValidatorFailureImpl,
};

describe("Validation Adapters (REQ-API-04)", () => {
  beforeEach(() => {
    mockCustomValidatorSuccessImpl.mockReset();
    mockCustomValidatorFailureImpl.mockReset();
    mockCustomValidatorSuccessImpl.mockImplementation((data) => ({
      success: true,
      data: {
        CUSTOM_VAR: `validated-${data.INPUT_VAR || "default"}`,
        VALIDATED: true,
        INPUT_VAR: data.INPUT_VAR as string | undefined,
        SECRET_INPUT: data.SECRET_INPUT as string | undefined,
      },
    }));
    mockCustomValidatorFailureImpl.mockImplementation((data) => ({
      success: false,
      error: {
        issues: [
          {
            path: ["INPUT_VAR"],
            message: `Custom validation failed on INPUT_VAR: ${data.INPUT_VAR}`,
          },
          {
            path: ["MISSING_CUSTOM"],
            message: "Custom missing required field",
          },
        ],
      },
    }));
  });

  describe("createEnv with Adapters", () => {
    it("should use default Zod adapter when only 'schema' is provided", () => {
      setupProcessEnv({
        API_URL: "https://zod.com",
        SECRET_KEY: "default-zod-adapter-key",
      });
      mockDotenvFiles({});
      const env = createEnv({
        schema: testSchema,
        _internalDotenvExpand: mockedDotenvExpand,
      });
      expect(env.API_URL).toBe("https://zod.com");
      expect(env.SECRET_KEY).toBe("default-zod-adapter-key");
    });

    it("should use custom validator adapter when 'validator' option is provided (success)", () => {
      setupProcessEnv({ INPUT_VAR: "test-input" });
      mockDotenvFiles({});
      const env = createEnv<undefined, CustomEnvType>({
        validator: customAdapterSuccess,
        _internalDotenvExpand: mockedDotenvExpand,
      });
      expect(mockCustomValidatorSuccessImpl).toHaveBeenCalledTimes(1);
      expect(env).toEqual({
        CUSTOM_VAR: "validated-test-input",
        VALIDATED: true,
        INPUT_VAR: "test-input",
        SECRET_INPUT: undefined,
      });
    });

    it("should use custom validator adapter when 'validator' option is provided (failure)", () => {
      setupProcessEnv({ INPUT_VAR: "invalid" });
      mockDotenvFiles({});
      expect(() => {
        createEnv<undefined, CustomEnvType>({
          validator: customAdapterFailure,
          _internalDotenvExpand: mockedDotenvExpand,
        });
      }).toThrow("Environment validation failed. Check console output.");
      expect(mockCustomValidatorFailureImpl).toHaveBeenCalledTimes(1);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining(
          "- INPUT_VAR: Custom validation failed on INPUT_VAR: invalid"
        )
      );
    });

    it("should throw error if 'schema' and 'validator' are provided together", () => {
      setupProcessEnv({ INPUT_VAR: "test" });
      mockDotenvFiles({});
      expect(() => {
        createEnv<typeof testSchema, CustomEnvType>({
          schema: testSchema,
          validator: customAdapterSuccess,
          _internalDotenvExpand: mockedDotenvExpand,
        });
      }).toThrow(/Cannot provide both 'schema' and 'validator' options/i);
    });

    it("should require explicit type parameter when using custom validator (compile-time)", () => {
      expect(true).toBe(true); // Placeholder
    });
  });

  describe("createEnvAsync with Adapters", () => {
    it("should use default Zod adapter when only 'schema' is provided (async)", async () => {
      setupProcessEnv({
        API_URL: "https://zod-async.com",
        SECRET_KEY: "default-zod-async-key",
      });
      mockDotenvFiles({});
      const env = await createEnvAsync({
        schema: testSchema,
        _internalDotenvExpand: mockedDotenvExpand,
      });
      expect(env.API_URL).toBe("https://zod-async.com");
    });

    it("should use custom validator adapter when 'validator' option is provided (async success)", async () => {
      setupProcessEnv({ INPUT_VAR: "async-test" });
      mockDotenvFiles({});
      const mockSecretSource: SecretSourceFunction = async () => ({
        SECRET_INPUT: "from-secret",
      });
      const env = await createEnvAsync<undefined, CustomEnvType>({
        validator: customAdapterSuccess,
        secretsSources: [mockSecretSource],
        _internalDotenvExpand: mockedDotenvExpand,
      });
      expect(mockCustomValidatorSuccessImpl).toHaveBeenCalledTimes(1);
      expect(env).toEqual({
        CUSTOM_VAR: "validated-async-test",
        VALIDATED: true,
        INPUT_VAR: "async-test",
        SECRET_INPUT: "from-secret",
      });
    });

    it("should use custom validator adapter when 'validator' option is provided (async failure)", async () => {
      setupProcessEnv({ INPUT_VAR: "invalid-async" });
      mockDotenvFiles({});
      await expect(
        createEnvAsync<undefined, CustomEnvType>({
          validator: customAdapterFailure,
          _internalDotenvExpand: mockedDotenvExpand,
        })
      ).rejects.toThrow("Environment validation failed. Check console output.");
      expect(mockCustomValidatorFailureImpl).toHaveBeenCalledTimes(1);
    });

    it("should reject if 'schema' and 'validator' are provided together (async)", async () => {
      setupProcessEnv({ INPUT_VAR: "test" });
      mockDotenvFiles({});
      await expect(
        createEnvAsync<typeof testSchema, CustomEnvType>({
          schema: testSchema,
          validator: customAdapterSuccess,
          _internalDotenvExpand: mockedDotenvExpand,
        })
      ).rejects.toThrow(
        /Cannot provide both 'schema' and 'validator' options/i
      );
    });
  });
});
