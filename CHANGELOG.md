// File: CHANGELOG.md

# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

_(Features currently in progress for the next release will go here)_
- *(Potentially REQ-LOAD-04 if prioritized)*
- *(Features for v2.0.0+)*

### Changed

_(Changes to existing functionality for the next release)_

### Deprecated

_(Features soon to be removed)_

### Removed

_(Features removed in the next release)_

### Fixed

_(Bug fixes for the next release)_

### Security

_(Security vulnerability fixes)_

## [1.1.0] - YYYY-MM-DD

*(Note: Replace YYYY-MM-DD with actual release date)*

### Added

- Support for environment-specific `.env` files (e.g., `.env.development`) based on `NODE_ENV` (REQ-LOAD-05). The merge order is now: Schema Defaults < Base `.env` < `.env.${NODE_ENV}` < `process.env`.
- Optional variable expansion using `dotenv-expand` via the `expandVariables: boolean` option (default: `false`). Expansion applies to merged `.env` file values before `process.env` merge and validation (REQ-LOAD-06). Added `dotenv-expand` as a production dependency.
- Comprehensive examples in the `/examples` directory demonstrating basic usage, Express integration, and common Zod patterns (REQ-DX-01).
- Enhanced unit tests covering environment-specific file loading and variable expansion edge cases (`NFR-TEST-02`).

### Changed

- Updated `README.md` to document v1.1.0 features (environment-specific files, expansion, updated merge precedence).
- Updated development dependencies (e.g., `@types/node`, `eslint`, `prettier`). *(Assumption)*
- Internal type definition refinement for injected dotenv/expand functions.

## [1.0.2] - YYYY-MM-DD

_(Date needs to be filled in based on actual release date)_

### Changed

- Updated dependencies (e.g., `dotenv`, development dependencies). _(Assumption based on typical patch release)_
- Internal code refactoring or documentation typo fixes. _(Assumption)_

## [1.0.1] - YYYY-MM-DD

_(Date needs to be filled in based on actual release date)_

### Fixed

- Potential minor bug fix related to initial release. _(Assumption)_

## [1.0.0] - YYYY-MM-DD

_(Date needs to be filled in based on actual release date)_

### Added

- Initial release of `schema-env`.
- Core `createEnv` function for validating environment variables against a Zod schema (REQ-API-01, REQ-API-02).
- Loading of variables from a `.env` file (customizable path) using `dotenv` (REQ-LOAD-01).
- Merging of variables from schema defaults, `.env` file, and `process.env` with documented precedence (REQ-LOAD-02).
- Validation using `zod.safeParse`, leveraging Zod's coercion (REQ-VALID-01, REQ-VALID-02).
- Aggregated error reporting to console and throwing an error on validation failure (REQ-ERR-01, REQ-ERR-02, REQ-ERR-03).
- Strongly typed return value based on the provided schema (REQ-API-03).
- Comprehensive unit tests for core functionality (REQ-TEST-01).

[Unreleased]: https://github.com/devvictrix/schema-env/compare/v1.1.0...HEAD
[1.1.0]: https://github.com/devvictrix/schema-env/compare/v1.0.2...v1.1.0
[1.0.2]: https://github.com/devvictrix/schema-env/releases/tag/v1.0.2
[1.0.1]: https://github.com/devvictrix/schema-env/releases/tag/v1.0.1
[1.0.0]: https://github.com/devvictrix/schema-env/releases/tag/v1.0.0