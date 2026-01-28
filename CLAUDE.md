# steam-mcp

MCP server providing Steam Web API access to AI assistants.

## Project Overview

- **Type**: Model Context Protocol (MCP) server
- **Runtime**: Node.js 22+ with ES modules
- **Language**: TypeScript (ES2022 target, strict mode)
- **Transport**: stdio (for Claude Desktop, Docker, MCP Inspector)
- **Tools**: 9 registered tools for Steam API access

## Project Structure

```
src/
├── index.ts          # Server init, tool registration, stdio transport
├── steam-api.ts      # Fetch wrappers for all Steam API endpoints
├── cache.ts          # Lazy-loaded Fuse.js search index (24h TTL)
├── types.ts          # TypeScript interfaces mirroring Steam API responses
└── tools/            # One file per tool, each exports register* function
    ├── search-apps.ts
    ├── get-store-details.ts
    ├── get-games.ts
    ├── get-recent-games.ts
    ├── get-player-summaries.ts
    ├── get-friend-list.ts
    ├── get-player-achievements.ts
    ├── get-current-players.ts
    └── get-news.ts
```

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

### Error Handling Pattern
```typescript
async ({ param }) => {
  try {
    // 1. Validate env vars first
    const apiKey = process.env.STEAM_API_KEY;
    if (!apiKey) {
      return { content: [{ type: "text" as const, text: "Error: ..." }], isError: true };
    }

    // 2. Validate parameters
    // 3. Call API
    // 4. Handle empty results gracefully (not an error)
    // 5. Return formatted response
    return { content: [{ type: "text" as const, text: result }] };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { content: [{ type: "text" as const, text: `Error: ${message}` }], isError: true };
  }
}
```

## Commands

| Command | Description |
|---------|-------------|
| `npm run build` | Compile TypeScript to `build/` |
| `npm run dev` | Watch mode compilation |
| `npm start` | Run the server |
| `npm run inspector` | Launch MCP Inspector for testing |

## Docker

```bash
# Build
docker build -t steam-mcp .

# Run
docker run -i -e STEAM_API_KEY=xxx -e STEAM_USER_ID=xxx steam-mcp
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `STEAM_API_KEY` | Yes* | Steam Web API key (from steamcommunity.com/dev/apikey) |
| `STEAM_USER_ID` | No | Default 64-bit Steam ID for user-specific tools |
| `TOOL_PREFIX` | No | Prefix for tool names (e.g., `steam_`) |

*Required for most tools; `get-store-details`, `get-current-players`, and `get-news` work without it.

## Adding a New Tool

1. Create `src/tools/tool-name.ts` with `registerToolName` export
2. Add fetch function to `src/steam-api.ts` if needed
3. Add response types to `src/types.ts`
4. Import and call register function in `src/index.ts`
5. Update README.md tools table

## API Reference

All Steam API endpoints use versions from the official Valve wiki:
- `ISteamUser/*` → `v0002` or `v0001`
- `ISteamUserStats/*` → `v0001` or `v0002`
- `ISteamNews/*` → `v0002`
- `IPlayerService/*` → `v0001`
- `IStoreService/*` → `v1`
