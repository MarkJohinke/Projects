# Repository Guidelines

This repository hosts a minimal Node.js project intended for quick experiments and CLI prototypes. Keep changes small, well‑scoped, and consistent with the current structure.

## Project Structure & Module Organization
- `src/` – runtime code (entry: `src/index.js`). Add new modules under `src/feature/` (e.g., `src/logging/logger.js`).
- `tests/` – test files and fixtures. Mirror `src/` structure (e.g., `tests/logging/logger.test.js`).
- Root – `package.json`, `README.md`, and project scripts. Avoid coupling to other sibling folders unless explicitly referenced.

## Build, Test, and Development Commands
- `npm install` – install dependencies (none by default).
- `npm start` – run the app (`node src/index.js`).
- `npm test` – placeholder test script; replace with your test runner when added.
- Example direct run: `node src/index.js`.

## Coding Style & Naming Conventions
- JavaScript (Node 18+); use 2‑space indentation, semicolons, and double quotes to match existing files.
- Filenames: `kebab-case` for files, `camelCase` for variables/functions, `PascalCase` for classes.
- Prefer small, pure functions and module exports over singletons.
- If adding tooling, use Prettier and ESLint; commit configs and format only touched files.

## Testing Guidelines
- Recommended: Jest or Vitest. Name tests `*.test.js` (e.g., `tests/foo.test.js`).
- Keep unit tests colocated in `tests/` mirroring `src/` paths; one test file per module.
- Aim for meaningful coverage of public APIs. No hard coverage gate yet; add one when stable.
- Run locally via your chosen runner (e.g., `npx vitest run`). Update `npm test` accordingly.

## Commit & Pull Request Guidelines
- Use clear, imperative commit subjects (e.g., `feat: add logger` or `fix: handle empty config`).
- Keep PRs focused; include a short description, linked issue (if any), and relevant output or screenshots for UX/CLI changes.
- Note breaking changes explicitly in the PR description.

## Security & Configuration Tips
- Never commit secrets. Use `.env` (already ignored) and provide a checked‑in `.env.example` when adding new variables.
- Validate and sanitize any file or network I/O. Avoid new dependencies unless justified.

## Agent‑Specific Notes
- Do not rename files or restructure directories without justification.
- Prefer minimal diffs; align with existing patterns and update docs/tests alongside code.
