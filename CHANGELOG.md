# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

*   **(v2.0.0)** **Asynchronous Validation (`createEnvAsync`):** Introduced a new `createEnvAsync` function that returns a `Promise`. This allows integrating asynchronous operations during environment setup (`REQ-INT-01`). `createEnv` remains strictly synchronous.
*   **(v2.0.0)** **Secrets Manager Integration (`secretsSources`):** The `createEnvAsync` function accepts an optional `secretsSources` option, an array of async functions (`() => Promise<Record<string, string | undefined>>`). This enables fetching secrets from external systems (like AWS Secrets Manager, Vault, etc.) concurrently during initialization (`REQ-INT-01`, `NFR-SEC-02`, `NFR-PERF-02`, `ADR-008`). Fetching errors are logged as warnings.
*   **(v2.0.0)** Added comprehensive unit tests for `createEnvAsync`, including precedence with secrets, error handling for failing sources, and interaction with existing options.

### Changed

*   **(v2.0.0)** **Merge Precedence (`createEnvAsync`):** Defined and implemented the merge precedence order specifically for `createEnvAsync`: Schema Defaults < `.env` files (expanded) < Secrets Sources < `process.env` (`NFR-DX-02`). The precedence for `createEnv` remains unchanged.
*   **(Internal)** Refactored internal loading, merging, and validation logic into helper functions (`_loadDotEnvFiles`, `_expandDotEnvValues`, `_mergeProcessEnv`, `_validateSchema`, `_formatZodError`, `_fetchSecrets`) shared between `createEnv` and `createEnvAsync` to improve maintainability (`NFR-MAIN-02`).

### Deprecated

_(Features soon to be removed)_

### Removed

_(Features removed in the next release)_

### Fixed

_(Bug fixes for the next release)_

### Security

_(Security vulnerability fixes)_

## [1.2.0] - 2025-04-30

### Added

- **Multiple `.env` File Paths:** The `dotEnvPath` option now accepts an array of file paths (e.g., `['.env.base', '.env.local']`). Files are loaded sequentially, with later files overriding earlier ones (`REQ-LOAD-04`).
- **Environment-Specific `.env` Loading:** Support for automatically loading environment-specific `.env` files (e.g., `.env.development`) based on `NODE_ENV`. This file is loaded _after_ any paths specified in `dotEnvPath` (unless `dotEnvPath` is `false`) and overrides them (`REQ-LOAD-05`).
- **Variable Expansion:** Optional variable expansion using `dotenv-expand` via the `expandVariables: boolean` option (default: `false`). Expansion applies to the merged dictionary of _all_ loaded `.env` file values (base, array paths, env-specific) _before_ merging with `process.env` and validation (`REQ-LOAD-06`). Added `dotenv-expand` as a production dependency.
- **Comprehensive Examples:** Added `/examples` directory demonstrating basic usage, Express integration, and common Zod patterns, now including example `.env` files (`REQ-DX-01`).
- **Enhanced Unit Tests:** Added tests covering multiple file loading, environment-specific loading, variable expansion, precedence, and edge cases (`NFR-TEST-02`).

### Changed

- **Merge Precedence Updated:** The documented and implemented order of precedence for environment variable sources is now:
  1.  `process.env` (Highest)
  2.  Environment-specific file (`.env.${NODE_ENV}`)
  3.  Files in `dotEnvPath` array (later overrides earlier) / Single `dotEnvPath` file / Default `./.env`
  4.  Schema Defaults (Lowest)
- Updated `README.md` and TSDoc comments to document all v1.2.0 features and the updated merge precedence.
- Internal file loading logic refactored to support array paths and correct precedence.
- Updated development dependencies (e.g., `@types/node`, `eslint`, `prettier`). _(Assumption)_
- Updated section titles in `specs/FUNCTIONAL_REQUIREMENTS.md` and `specs/NON_FUNCTIONAL_REQUIREMENTS.md` to reflect v1.2.0.

### Fixed

- Corrected test assertion logic related to precedence involving `process.env`.

## [1.0.2] - 2025-04-01

### Changed

- Updated dependencies (e.g., `dotenv`, development dependencies). _(Assumption based on typical patch release)_
- Internal code refactoring or documentation typo fixes. _(Assumption)_

## [1.0.1] - 2025-04-01

### Fixed

- Potential minor bug fix related to initial release. _(Assumption)_

## [1.0.0] - 2025-04-01

### Added

- Initial release of `schema-env`.
- Core `createEnv` function for validating environment variables against a Zod schema (REQ-API-01, REQ-API-02).
- Loading of variables from a `.env` file (customizable path) using `dotenv` (REQ-LOAD-01).
- Merging of variables from schema defaults, `.env` file, and `process.env` with documented precedence (REQ-LOAD-02).
- Validation using `zod.safeParse`, leveraging Zod's coercion (REQ-VALID-01, REQ-VALID-02).
- Aggregated error reporting to console and throwing an error on validation failure (REQ-ERR-01, REQ-ERR-02, REQ-ERR-03).
- Strongly typed return value based on the provided schema (REQ-API-03).
- Comprehensive unit tests for core functionality (REQ-TEST-01).

[Unreleased]: https://github.com/devvictrix/schema-env/compare/v1.2.0...HEAD
[1.2.0]: https://github.com/devvictrix/schema-env/compare/v1.0.2...v1.2.0
[1.0.2]: https://github.com/devvictrix/schema-env/releases/tag/v1.0.2
[1.0.1]: https://github.com/devvictrix/schema-env/releases/tag/v1.0.1
[1.0.0]: https://github.com/devvictrix/schema-env/releases/tag/v1.0.0