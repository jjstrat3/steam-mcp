# steam-mcp

MCP server providing Steam Web API access to AI assistants.

## Project Overview

- **Type**: Model Context Protocol (MCP) server
- **Runtime**: Node.js with ES modules (CI and Docker currently use Node 24, but `package.json` does not declare an `engines` requirement)
- **Language**: TypeScript (ES2022 target, strict mode)
- **Transport**: stdio (for Claude Desktop, Docker, MCP Inspector)
- **Package**: `steam-mcp` v1.1.0
- **Tools**: 10 registered tools for Steam API access
- **Tests**: Vitest unit tests for API functions, cache module, and select tools
- **Linting**: ESLint with TypeScript plugin

## Project Structure

```
steam-mcp/
├── .github/workflows/
│   ├── ci.yml              # PR quality gates (lint, test, build, docker)
│   ├── docker-publish.yml  # Multi-platform Docker image → GHCR
│   └── release.yml         # GitHub Release on v* tags or manual workflow dispatch
├── src/
│   ├── index.ts            # Server init, tool registration, stdio transport
│   ├── steam-api.ts        # Fetch wrappers for all Steam API endpoints
│   ├── steam-api.test.ts   # Unit tests for API fetch functions
│   ├── cache.ts            # Lazy-loaded Fuse.js search index (24h TTL)
│   ├── cache.test.ts       # Unit tests for search functionality
│   ├── types.ts            # TypeScript interfaces mirroring Steam API responses
│   └── tools/              # One file per tool, each exports register* function
│       ├── search-apps.ts
│       ├── get-store-details.ts
│       ├── get-games.ts
│       ├── get-recent-games.ts
│       ├── get-player-summaries.ts
│       ├── get-friend-list.ts          # + get-friend-list.test.ts
│       ├── get-player-achievements.ts  # + get-player-achievements.test.ts
│       ├── get-current-players.ts
│       ├── get-news.ts
│       └── get-playtime-analytics.ts  # + get-playtime-analytics.test.ts
├── .env.example            # Sample environment variables
├── Dockerfile              # Multi-stage build (node:24-alpine)
├── eslint.config.js        # ESLint 9 flat config for TypeScript
├── vitest.config.ts        # Vitest configuration
├── package.json
└── tsconfig.json
```

## Dependencies

| Package | Purpose |
|---------|---------|
| `@modelcontextprotocol/sdk` | MCP server framework (`McpServer`, `StdioServerTransport`) |
| `fuse.js` | Fuzzy search for the app name index (~240k apps) |
| `zod` | Schema validation for tool parameters |
| `typescript` (dev) | Compiler |
| `@types/node` (dev) | Node.js type definitions |
| `eslint` (dev) | Linter for code quality |
| `@typescript-eslint/*` (dev) | TypeScript support for ESLint |
| `vitest` (dev) | Unit testing framework |
| `@vitest/coverage-v8` (dev) | Code coverage reporting |

## Tools

| Tool | Auth Required | Description |
|------|:---:|-------------|
| `search-apps` | Yes | Fuzzy search Steam apps by name using cached Fuse.js index |
| `get-store-details` | No | Pricing, descriptions, screenshots, system requirements, reviews |
| `get-games` | Yes | All games owned by a user, sorted by playtime |
| `get-recent-games` | Yes | Games played in the last 2 weeks with playtime |
| `get-player-summaries` | Yes | Profile info, online status, avatar, currently playing, and privacy-aware summary output (up to 100 IDs) |
| `get-friend-list` | Yes | Friend list with display names when enrichment succeeds; public profiles only |
| `get-player-achievements` | Yes | Achievement progress with global unlock percentages, with unlocked entries sorted by recency |
| `get-playtime-analytics` | Yes | Library playtime summary with four categories: recently played, most played, least played, never played |
| `get-current-players` | No | Current in-game player count |
| `get-news` | No | Latest news articles and patch notes (configurable count 1–50) |

"Auth Required" means `STEAM_API_KEY` must be set.

## Code Style & Conventions

### Naming
- **Files**: kebab-case (`get-player-summaries.ts`)
- **Functions**: camelCase with prefixes (`registerGetGames`, `fetchOwnedGames`)
- **Types**: PascalCase, `*Response` suffix for API responses (`PlayerSummariesResponse`)
- **Constants**: SCREAMING_SNAKE_CASE (`REFRESH_INTERVAL`)

### Imports
- Use `import type { ... }` for type-only imports
- Use `.js` extension in imports (required for Node16 module resolution)

### Tool Registration Pattern
Each tool file exports a single `register*` function:
```typescript
export function registerToolName(server: McpServer, prefix: string): void {
  server.tool(
    `${prefix}tool-name`,
    "Description for the tool",
    { param: z.string().describe("Parameter description") },
    async ({ param }) => {
      // Implementation
    }
  );
}
```

All register functions are imported and called in `src/index.ts` with the `TOOL_PREFIX` env var (defaults to `""`).

### Error Handling Pattern
```typescript
async ({ param }) => {
  try {
    // 1. Validate required env vars for auth-required tools
    // 2. Resolve parameters (including STEAM_USER_ID fallback where relevant)
    // 3. Call shared steam-api.ts fetch helpers
    // 4. Treat empty Steam results as readable success responses where appropriate
    // 5. Return MCP text payload
    return { content: [{ type: "text" as const, text: result }] };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { content: [{ type: "text" as const, text: `Error: ${message}` }], isError: true };
  }
}
```

### API Fetch Pattern (`steam-api.ts`)
Each Steam endpoint has a dedicated async function that:
1. Builds `URLSearchParams` with the required keys
2. Calls `fetchWithRetry()` — a wrapper with a 15s per-attempt timeout, up to 2 retries, exponential backoff (`1000ms * 2^attempt`) plus `0-500ms` jitter, and `Retry-After` support for 429s (capped at 30s)
3. Retries only on 429, 5xx, timeouts, and transient network failures; other 4xx responses are returned immediately
4. Checks `res.ok` and throws on failure; friend-list 401s become a user-facing "friend list is not public" error
5. Parses JSON with a typed response interface
6. Returns the inner data with `?? []` fallback for missing arrays

A custom `PlayerAchievementsUnavailableError` is thrown when Steam returns a non-success achievements payload. The tool layer converts that into a user-facing error covering private profiles, games without achievements, and temporary Steam-side unavailability.

## Key Implementation Details

### App Search Cache (`cache.ts`)
- Fetches the full Steam app list (~240k apps) via paginated `IStoreService/GetAppList/v1` calls (50k per page)
- Builds a Fuse.js index with: `threshold: 0.3`, `distance: 200`, `minMatchCharLength: 2`
- Cache TTL is 24 hours (`REFRESH_INTERVAL = 86_400_000ms`)
- Lazy-loaded on first search; refreshed when stale
- Scores normalized to 0–1 (higher = better match)

### Friend List Enrichment (`get-friend-list.ts`)
- After fetching the friend list, batch-fetches player summaries in groups of 100 (Steam API limit) to add display names
- Best-effort: the tool still returns Steam IDs and friend-since dates if summary enrichment partially or fully fails
- Missing enriched names are rendered as `Unknown`, and the response includes a notice explaining whether enrichment was partial or unavailable

### Achievement Sorting (`get-player-achievements.ts`)
- Unlocked achievements are sorted by most recent unlock time first
- Locked achievements are sorted by global unlock percentage descending (most common/easiest first)
- Best-effort: progress is still returned if global unlock percentage enrichment is unavailable, with a notice describing whether rarity data is fully or partially missing

## Commands

| Command | Description |
|---------|-------------|
| `npm run build` | Compile TypeScript to `build/` |
| `npm run dev` | Watch mode compilation |
| `npm start` | Run the compiled server (`node build/index.js`) |
| `npm run inspector` | Launch MCP Inspector for interactive tool testing |
| `npm run typecheck` | Type check without emitting files |
| `npm run lint` | Lint source files with ESLint |
| `npm run lint:fix` | Lint and auto-fix issues |
| `npm test` | Run unit tests |
| `npm run test:watch` | Run tests in watch mode |
| `npm run test:coverage` | Run tests with coverage report |

## Docker

Multi-stage build using `node:24-alpine`. Builder stage compiles TypeScript; runtime stage copies only `build/` and production dependencies.

```bash
# Build locally
docker build -t steam-mcp .

# Run
docker run -i -e STEAM_API_KEY=xxx -e STEAM_USER_ID=xxx steam-mcp

# Pre-built image from GHCR
docker pull ghcr.io/jjstrat3/steam-mcp:latest
docker run -i -e STEAM_API_KEY=xxx -e STEAM_USER_ID=xxx ghcr.io/jjstrat3/steam-mcp:latest
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `STEAM_API_KEY` | Yes* | Steam Web API key (from steamcommunity.com/dev/apikey) |
| `STEAM_USER_ID` | No | Default 64-bit Steam ID for user-specific tools (overridable per-call) |
| `TOOL_PREFIX` | No | Prefix for tool names (e.g., `steam_` → `steam_search-apps`) |

*Required for most tools; `get-store-details`, `get-current-players`, and `get-news` work without it.

## CI/CD

### CI Quality Gates (`.github/workflows/ci.yml`)
- **Triggers**: All PRs and pushes to main/master
- **Quality Gates**:
  - Type checking (`npm run typecheck`)
  - Linting (`npm run lint`)
  - Unit tests (`npm test`)
  - Build validation (`npm run build`)
  - Docker build validation (PRs only, does not push)
- All gates must pass before PR can be merged

### Docker Publish (`.github/workflows/docker-publish.yml`)
- **Triggers**: push to main/master and v* tags only
- **Builds**: multi-platform images (linux/amd64, linux/arm64)
- **Publishes**: to GitHub Container Registry (`ghcr.io`)
- **Tags**: branch name, semver patterns, `latest` on default branch

### Release (`.github/workflows/release.yml`)
- **Triggers**: push of v* tags and manual workflow dispatch
- Manual dispatch bumps `package.json`/`package-lock.json`, creates and pushes the matching `v*` tag, publishes Docker images, and creates the GitHub Release in one run

## Adding a New Tool

1. Create `src/tools/tool-name.ts` with `registerToolName` export
2. Add fetch function to `src/steam-api.ts` if needed
3. Add response types to `src/types.ts`
4. Add unit tests for new fetch function in `src/steam-api.test.ts`
5. Import and call register function in `src/index.ts`
6. Update README.md tools table
7. Run `npm run lint` and `npm test` to ensure quality gates pass

## API Reference

All Steam API endpoints use versions from the official Valve wiki:
- `IStoreService/GetAppList` → `v1`
- `ISteamUser/GetPlayerSummaries` → `v0002`
- `ISteamUser/GetFriendList` → `v0001`
- `IPlayerService/GetOwnedGames` → `v0001`
- `IPlayerService/GetRecentlyPlayedGames` → `v0001`
- `ISteamUserStats/GetPlayerAchievements` → `v0001`
- `ISteamUserStats/GetGlobalAchievementPercentagesForApp` → `v0002`
- `ISteamUserStats/GetNumberOfCurrentPlayers` → `v0001`
- `ISteamNews/GetNewsForApp` → `v0002`
- Store details use the unofficial `store.steampowered.com/api/appdetails` endpoint
