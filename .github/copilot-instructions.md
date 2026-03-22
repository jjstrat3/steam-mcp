# Copilot Instructions

## Build, test, and lint commands

Use the same commands that CI runs:

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

For focused Vitest runs, prefer targeting `src/` explicitly:

```bash
npx vitest run src/cache.test.ts
npx vitest run src/cache.test.ts -t "should refresh after the cache expires"
```

Use `npm run inspector` after building when you need to exercise the MCP server entry point through MCP Inspector.

If `build/` already exists, `npm test` can also discover compiled `build/*.test.js` files. For single-file or single-test runs, use `npx vitest run src/...` so you only execute the TypeScript source tests.

## High-level architecture

This repository is a stdio-based MCP server for the Steam Web API using ESM TypeScript. CI and the Dockerfile currently use Node 22, but `package.json` does not declare an `engines` requirement, so do not assume Node 22 is a hard runtime constraint unless the repo is updated to enforce one.

- `src/index.ts` is the thin entry point. It reads `TOOL_PREFIX`, creates the `McpServer`, registers every tool, and connects the stdio transport.
- `src/tools/*.ts` contains the MCP-facing tool handlers. Each tool defines its own Zod input schema, validates required environment variables, resolves `STEAM_USER_ID` fallbacks, calls shared fetch helpers, and formats the final text response returned to the MCP client.
- `src/steam-api.ts` is the shared Steam API layer. Keep raw HTTP access here instead of inside tool files. It owns retry/timeout behavior (`fetchWithRetry`), endpoint-specific URL construction, response parsing, and Steam-specific error cases such as private friend lists and unavailable achievement data.
- `src/cache.ts` is the stateful search layer used by `search-apps`. It lazily fetches the full Steam app catalog, builds a Fuse.js index once, deduplicates concurrent first-load requests with a shared promise, and refreshes the cache every 24 hours.

When adding a tool, the normal change surface is:

- add the MCP handler in `src/tools/`
- add or extend fetch helpers in `src/steam-api.ts`
- add response types in `src/types.ts`
- register the tool in `src/index.ts`
- update `README.md`
- add or extend Vitest coverage

## Key conventions

- Internal TypeScript imports use `.js` extensions, and type-only imports use `import type`.
- Tool files follow a strict one-file/one-register-function pattern: `registerX(server, prefix)` registering a `${prefix}kebab-case-name` tool.
- Tool handlers return MCP text payloads shaped like `{ content: [{ type: "text" as const, text }] }`. Missing configuration or failed API calls should return `isError: true`; empty Steam results are usually reported as successful human-readable responses instead of errors.
- User-scoped tools validate `STEAM_API_KEY` first, then resolve `steamid` from the tool arguments or `STEAM_USER_ID`.
- Keep Steam HTTP logic in `src/steam-api.ts`; tool files should focus on validation, orchestration, and response formatting.
- `search-apps` depends on `STEAM_API_KEY` because the cache bootstrap pulls the full app list from `IStoreService/GetAppList/v1`.
- Best-effort enrichment is part of the current behavior. `get-friend-list` batches `fetchPlayerSummaries` in groups of 100 to add display names, and still returns the friend list if enrichment is partial. `get-player-achievements` still returns progress if global unlock-percentage enrichment is unavailable.
- `fetchWithRetry` is the shared network policy: 15s timeout per attempt, bounded retries for 429/5xx and transient network failures, exponential backoff with jitter, and `Retry-After` support.
- `cache.ts` uses module-level singleton state. Tests for it should reset modules and dynamically re-import the module under test instead of assuming fresh state between cases.
- `steam-api.test.ts` mocks `global.fetch` directly and asserts the request init includes a `signal`; match that pattern when adding fetch-wrapper tests.
