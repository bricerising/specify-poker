# Spec 008: Code Quality and Linting Standards

## Goal
Maintain a high-quality, human-readable, and type-safe codebase for the Poker platform.

## Linting Rules
The project uses ESLint with TypeScript and React plugins. All code must pass `npm run lint` without errors.

### 1. No Explicit Any
- **Problem**: `any` bypasses type checking and leads to runtime errors.
- **Requirement**: Use specific types or interfaces. If a type is truly unknown, use `unknown`.
- **gRPC Handlers**: Use specific request and response interfaces instead of `any`.

### 2. No Require Imports
- **Problem**: `require()` is legacy CommonJS and doesn't work well with ESM or type checking.
- **Requirement**: Use ES `import` statements exclusively. For dynamic imports, use `import()`.

### 3. No Unused Variables
- **Problem**: Unused variables clutter the code and can indicate bugs.
- **Requirement**: Remove unused variables. If a variable is necessary for a function signature but not used, prefix it with an underscore (e.g., `_req`).

### 4. Human Readable Code
- Prefer descriptive variable names.
- Use `forEach` or `map` instead of empty-variable loops when possible.
- Avoid large try-catch blocks with `any` error types; cast to `Error` or use type guards.

## Enforcement
- Linting is part of the CI/CD pipeline.
- Pre-commit hooks should run linting on changed files.
- No PR should be merged with linting errors.
