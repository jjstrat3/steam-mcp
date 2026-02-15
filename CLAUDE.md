# steam-mcp

MCP server providing Steam Web API access to AI assistants.

## Project Overview

- **Type**: Model Context Protocol (MCP) server
- **Runtime**: Node.js 22+ with ES modules
- **Language**: TypeScript (ES2022 target, strict mode)
- **Transport**: stdio (for Claude Desktop, Docker, MCP Inspector)
- **Package**: `steam-mcp` v1.0.0
- **Tools**: 9 registered tools for Steam API access
- **Tests**: None — use MCP Inspector (`npm run inspector`) for interactive testing

## Project Structure

```
steam-mcp/
├── .github/workflows/
│   ├── docker-publish.yml  # Multi-platform Docker image → GHCR
│   └── release.yml         # GitHub Release on v* tags
├── src/
│   ├── index.ts            # Server init, tool registration, stdio transport
│   ├── steam-api.ts        # Fetch wrappers for all Steam API endpoints
│   ├── cache.ts            # Lazy-loaded Fuse.js search index (24h TTL)
│   ├── types.ts            # TypeScript interfaces mirroring Steam API responses
│   └── tools/              # One file per tool, each exports register* function
│       ├── search-apps.ts
│       ├── get-store-details.ts
│       ├── get-games.ts
│       ├── get-recent-games.ts
│       ├── get-player-summaries.ts
│       ├── get-friend-list.ts
│       ├── get-player-achievements.ts
│       ├── get-current-players.ts
│       └── get-news.ts
├── Dockerfile              # Multi-stage build (node:22-alpine)
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

## Tools

| Tool | Auth Required | Description |
|------|:---:|-------------|
| `search-apps` | Yes | Fuzzy search Steam apps by name using cached Fuse.js index |
| `get-store-details` | No | Pricing, descriptions, screenshots, system requirements, reviews |
| `get-games` | Yes | All games owned by a user, sorted by playtime |
| `get-recent-games` | Yes | Games played in the last 2 weeks with playtime |
| `get-player-summaries` | Yes | Profile info, online status, avatar, currently playing (up to 100 IDs) |
| `get-friend-list` | Yes | Friend list with display names, enriched via batched player summaries |
| `get-player-achievements` | Yes | Achievement progress with global unlock percentages, sorted by recency/rarity |
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
    // 1. Validate env vars first (STEAM_API_KEY)
    const apiKey = process.env.STEAM_API_KEY;
    if (!apiKey) {
      return { content: [{ type: "text" as const, text: "Error: ..." }], isError: true };
    }

    // 2. Validate parameters (resolve STEAM_USER_ID fallback)
    // 3. Call API via steam-api.ts fetch function
    // 4. Handle empty results gracefully (not an error)
    // 5. Return formatted text response
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
2. Calls `fetch()` to the Steam API URL
3. Checks `res.ok` and throws on failure (with special 401 handling for friend lists)
4. Parses JSON with a typed response interface
5. Returns the inner data with `?? []` fallback for missing arrays

## Key Implementation Details

### App Search Cache (`cache.ts`)
- Fetches the full Steam app list (~240k apps) via paginated `IStoreService/GetAppList/v1` calls (50k per page)
- Builds a Fuse.js index with: `threshold: 0.3`, `distance: 200`, `minMatchCharLength: 2`
- Cache TTL is 24 hours (`REFRESH_INTERVAL = 86_400_000ms`)
- Lazy-loaded on first search; refreshed when stale
- Scores normalized to 0–1 (higher = better match)

### Friend List Enrichment (`get-friend-list.ts`)
- After fetching the friend list, batch-fetches player summaries in groups of 100 (Steam API limit) to add display names and online status

### Achievement Sorting (`get-player-achievements.ts`)
- Unlocked achievements sorted by most recent unlock time
- Locked achievements sorted by global unlock percentage (rarest first)

## Commands

| Command | Description |
|---------|-------------|
| `npm run build` | Compile TypeScript to `build/` |
| `npm run dev` | Watch mode compilation |
| `npm start` | Run the compiled server (`node build/index.js`) |
| `npm run inspector` | Launch MCP Inspector for interactive tool testing |

## Docker

Multi-stage build using `node:22-alpine`. Builder stage compiles TypeScript; runtime stage copies only `build/` and production dependencies.

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

### Docker Publish (`.github/workflows/docker-publish.yml`)
- **Triggers**: push to main/master, v* tags, PRs to main/master
- **Builds**: multi-platform images (linux/amd64, linux/arm64)
- **Publishes**: to GitHub Container Registry (`ghcr.io`)
- **Tags**: branch name, PR ref, semver patterns, `latest` on default branch
- PRs build but do not push

### Release (`.github/workflows/release.yml`)
- **Triggers**: push of v* tags
- Creates a GitHub Release with auto-generated release notes and Docker pull instructions

## Adding a New Tool

1. Create `src/tools/tool-name.ts` with `registerToolName` export
2. Add fetch function to `src/steam-api.ts` if needed
3. Add response types to `src/types.ts`
4. Import and call register function in `src/index.ts`
5. Update README.md tools table

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
