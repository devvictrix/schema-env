# Contributing to schema-env

Thank you for your interest in contributing to `schema-env`! Whether you're reporting a bug, suggesting an enhancement, or working on a feature outlined in the roadmap, these guidelines will help ensure a smooth process.

## Development Philosophy

- **Roadmap-Driven:** Development activities should align with the features and goals outlined in `docs/ROADMAP.md`.
- **Specification-Based:** Implementation should adhere to the functional requirements (`specs/REQUIREMENTS.md`) and non-functional requirements (`specs/NFRS.md`) defined for the relevant feature or version.
- **Quality Focused:** We prioritize reliability, maintainability, performance, and developer experience (DX). Comprehensive testing and clear documentation are essential.

## Reporting Issues

- Please use GitHub Issues to report bugs or suggest features not already covered in the roadmap.
- Provide as much detail as possible, including:
  - Version of `schema-env`
  - Node.js version
  - Steps to reproduce the issue
  - Expected behavior vs. actual behavior
  - Any relevant code snippets or error messages

## Development Workflow

1.  **Ensure Context:** Before starting work, familiarize yourself with the latest `docs/ROADMAP.md`, relevant `specs/`, and `docs/AI_INSTRUCTIONS.md`.
2.  **Setup:**
    - Clone the repository.
    - Install dependencies: `npm install`
3.  **Branching:** Create a new branch for your feature or bugfix (e.g., `feat/variable-expansion`, `fix/dotenv-enoent-handling`).
4.  **Implementation:** Write code adhering to the project's TypeScript style and architectural patterns.
5.  **Testing:**
    - Write new unit tests (using Jest in `tests/`) for any new functionality or bug fixes.
    - Ensure all tests pass: `npm test`
    - Check code coverage (aiming for NFR-TEST-03): `npm test -- --coverage`
6.  **Formatting:** Ensure code is formatted: `npm run format`
7.  **Documentation:**
    - Update TSDoc comments in the code.
    - Update `README.md`, `examples/`, or `specs/` as necessary.
    - Add an entry to the `[Unreleased]` section of `CHANGELOG.md`.
8.  **Roadmap Update:** Update the status, progress, and notes for the relevant feature(s) in `docs/ROADMAP.md`.
9.  **Commit:** Write clear and concise commit messages (e.g., `feat(loading): Add support for expandVariables option (REQ-LOAD-06)`).
10. **Pull Request:** Push your branch to GitHub and open a Pull Request against the main development branch. Describe your changes clearly, referencing the relevant Roadmap item(s) and Issue(s).

## Code Style

- Code formatting is enforced by Prettier (`npm run format`).
- Adhere to general TypeScript best practices. (Consider adding ESLint in the future).

Thank you for contributing!