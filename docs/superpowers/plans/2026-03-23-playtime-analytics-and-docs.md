# Playtime Analytics Tool + Docs Reconciliation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `get-playtime-analytics` tool that returns a comprehensive playtime summary of a user's Steam library, and reconcile README.md and CLAUDE.md with the implementation.

**Architecture:** The tool reuses the existing `fetchOwnedGames()` function from `steam-api.ts` — no new API endpoints. It categorizes the returned `OwnedGame[]` array into four sections (recently played, most played, least played, never played) and formats them as plain text. Docs reconciliation is a single pass over README.md and CLAUDE.md.

**Tech Stack:** TypeScript, Vitest, Zod, `@modelcontextprotocol/sdk`

**Spec:** `docs/superpowers/specs/2026-03-23-playtime-analytics-and-docs-design.md`

---

### Task 1: Write failing tests for `get-playtime-analytics`

**Files:**
- Create: `src/tools/get-playtime-analytics.test.ts`

- [ ] **Step 1: Create test file with all test cases**

```typescript
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { OwnedGame } from "../types.js";

vi.mock("../steam-api.js", () => ({
  fetchOwnedGames: vi.fn(),
}));

import { fetchOwnedGames } from "../steam-api.js";
import { registerGetPlaytimeAnalytics } from "./get-playtime-analytics.js";

interface ToolResponse {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
}

function createGame(
  name: string,
  playtimeForever: number,
  playtime2weeks?: number
): OwnedGame {
  return {
    appid: Math.floor(Math.random() * 100000),
    name,
    playtime_forever: playtimeForever,
    ...(playtime2weeks !== undefined && { playtime_2weeks: playtime2weeks }),
  };
}

function getHandler(): (
  args: { steamid?: string; limit?: number }
) => Promise<ToolResponse> {
  const tool = vi.fn();
  const server = { tool } as unknown as McpServer;
  registerGetPlaytimeAnalytics(server, "");
  return tool.mock.calls[0][3] as (
    args: { steamid?: string; limit?: number }
  ) => Promise<ToolResponse>;
}

describe("get-playtime-analytics tool", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    process.env.STEAM_API_KEY = "test-key";
    delete process.env.STEAM_USER_ID;
  });

  it("returns all four categories for a mixed library", async () => {
    vi.mocked(fetchOwnedGames).mockResolvedValueOnce([
      createGame("Big Game", 60000, 500),      // recently played + most played
      createGame("Medium Game", 3000),           // most played
      createGame("Tried Once", 30),              // least played (<120 min)
      createGame("Barely Touched", 10),          // least played (<120 min)
      createGame("Backlog Title", 0),            // never played
      createGame("Another Backlog", 0),          // never played
    ]);

    const handler = getHandler();
    const result = await handler({ steamid: "owner-id" });

    const text = result.content[0].text;
    expect(result.isError).toBeUndefined();

    // Summary header
    expect(text).toContain("6 games owned");
    expect(text).toContain("1050.0 hours"); // (60000+3000+30+10)/60 = 1050.67 — total

    // All four category headers present
    expect(text).toContain("Recently Played");
    expect(text).toContain("Most Played");
    expect(text).toContain("Least Played");
    expect(text).toContain("Never Played");

    // Recently Played section includes the game with 2-week playtime
    expect(text).toContain("Big Game");

    // Least Played section includes low-playtime games
    expect(text).toContain("Tried Once");
    expect(text).toContain("Barely Touched");

    // Never Played section includes zero-playtime games
    expect(text).toContain("Backlog Title");
    expect(text).toContain("Another Backlog");
  });

  it("returns a readable message for an empty library", async () => {
    vi.mocked(fetchOwnedGames).mockResolvedValueOnce([]);

    const handler = getHandler();
    const result = await handler({ steamid: "owner-id" });

    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toContain("No games found");
  });

  it("shows only Never Played when all games have zero playtime", async () => {
    vi.mocked(fetchOwnedGames).mockResolvedValueOnce([
      createGame("Zebra Game", 0),
      createGame("Alpha Game", 0),
      createGame("Middle Game", 0),
    ]);

    const handler = getHandler();
    const result = await handler({ steamid: "owner-id" });

    const text = result.content[0].text;
    expect(result.isError).toBeUndefined();
    expect(text).toContain("Never Played");
    expect(text).not.toContain("Recently Played");
    expect(text).not.toContain("Most Played");
    expect(text).not.toContain("Least Played");

    // Alphabetical order
    const alphaIdx = text.indexOf("Alpha Game");
    const middleIdx = text.indexOf("Middle Game");
    const zebraIdx = text.indexOf("Zebra Game");
    expect(alphaIdx).toBeLessThan(middleIdx);
    expect(middleIdx).toBeLessThan(zebraIdx);
  });

  it("places a single game in the correct category", async () => {
    vi.mocked(fetchOwnedGames).mockResolvedValueOnce([
      createGame("Only Game", 5000),
    ]);

    const handler = getHandler();
    const result = await handler({ steamid: "owner-id" });

    const text = result.content[0].text;
    expect(text).toContain("Most Played");
    expect(text).toContain("Only Game");
    expect(text).not.toContain("Least Played");
    expect(text).not.toContain("Never Played");
    expect(text).not.toContain("Recently Played");
  });

  it("respects the limit parameter", async () => {
    const games = Array.from({ length: 20 }, (_, i) =>
      createGame(`Game ${String(i).padStart(2, "0")}`, (20 - i) * 1000)
    );
    vi.mocked(fetchOwnedGames).mockResolvedValueOnce(games);

    const handler = getHandler();
    const result = await handler({ steamid: "owner-id", limit: 3 });

    const text = result.content[0].text;
    // Most Played should only show 3 games
    expect(text).toContain("Game 00");
    expect(text).toContain("Game 01");
    expect(text).toContain("Game 02");
    expect(text).not.toContain("Game 03");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/tools/get-playtime-analytics.test.ts`
Expected: FAIL — cannot resolve `./get-playtime-analytics.js`

- [ ] **Step 3: Commit failing tests**

```bash
git add src/tools/get-playtime-analytics.test.ts
git commit -m "test: add failing tests for get-playtime-analytics tool"
```

---

### Task 2: Implement `get-playtime-analytics` tool

**Files:**
- Create: `src/tools/get-playtime-analytics.ts`

- [ ] **Step 1: Create the tool implementation**

```typescript
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { fetchOwnedGames } from "../steam-api.js";
import type { OwnedGame } from "../types.js";

const LEAST_PLAYED_THRESHOLD_MINUTES = 120;

function minutesToHours(minutes: number): string {
  return (minutes / 60).toFixed(1);
}

function formatGame(game: OwnedGame, include2Weeks: boolean): string {
  const hours = `${minutesToHours(game.playtime_forever)} hours`;
  const recent =
    include2Weeks && game.playtime_2weeks
      ? ` (${minutesToHours(game.playtime_2weeks)} hours last 2 weeks)`
      : "";
  return `  ${game.name} (appid: ${game.appid}) - ${hours}${recent}`;
}

export function registerGetPlaytimeAnalytics(
  server: McpServer,
  prefix: string
): void {
  server.tool(
    `${prefix}get-playtime-analytics`,
    "Summarize a Steam user's library playtime into categories: recently played, most played, least played, and never played",
    {
      steamid: z
        .string()
        .optional()
        .describe(
          "64-bit Steam ID of the user. Defaults to STEAM_USER_ID environment variable if not provided."
        ),
      limit: z
        .number()
        .min(1)
        .max(50)
        .optional()
        .describe("Max games shown per category (1-50, default 10)."),
    },
    async ({ steamid, limit }) => {
      try {
        const apiKey = process.env.STEAM_API_KEY;
        if (!apiKey) {
          return {
            content: [
              {
                type: "text" as const,
                text: "Error: STEAM_API_KEY environment variable is not set. Get your key at https://steamcommunity.com/dev/apikey",
              },
            ],
            isError: true,
          };
        }

        const userId = steamid || process.env.STEAM_USER_ID;
        if (!userId) {
          return {
            content: [
              {
                type: "text" as const,
                text: "Error: No Steam ID provided. Pass a steamid argument or set the STEAM_USER_ID environment variable.",
              },
            ],
            isError: true,
          };
        }

        const games = await fetchOwnedGames(apiKey, userId);

        if (games.length === 0) {
          return {
            content: [
              {
                type: "text" as const,
                text: `No games found for Steam ID ${userId}. The profile may be private.`,
              },
            ],
          };
        }

        const cap = limit ?? 10;
        const totalMinutes = games.reduce(
          (sum, g) => sum + g.playtime_forever,
          0
        );

        // Categorize
        const recentlyPlayed = games
          .filter((g) => g.playtime_2weeks && g.playtime_2weeks > 0)
          .sort((a, b) => (b.playtime_2weeks ?? 0) - (a.playtime_2weeks ?? 0))
          .slice(0, cap);

        const mostPlayed = [...games]
          .sort((a, b) => b.playtime_forever - a.playtime_forever)
          .filter((g) => g.playtime_forever > 0)
          .slice(0, cap);

        const leastPlayed = [...games]
          .filter(
            (g) =>
              g.playtime_forever > 0 &&
              g.playtime_forever < LEAST_PLAYED_THRESHOLD_MINUTES
          )
          .sort((a, b) => a.playtime_forever - b.playtime_forever)
          .slice(0, cap);

        const neverPlayed = games
          .filter((g) => g.playtime_forever === 0)
          .sort((a, b) => a.name.localeCompare(b.name))
          .slice(0, cap);

        // Build output
        const sections: string[] = [];

        sections.push(
          `Library Summary for Steam ID ${userId}:`,
          `${games.length} games owned | ${minutesToHours(totalMinutes)} hours total playtime`
        );

        if (recentlyPlayed.length > 0) {
          sections.push(
            "",
            `--- Recently Played (last 2 weeks) ---`,
            ...recentlyPlayed.map((g) => formatGame(g, true))
          );
        }

        if (mostPlayed.length > 0) {
          sections.push(
            "",
            `--- Most Played (by total hours) ---`,
            ...mostPlayed.map((g) => formatGame(g, false))
          );
        }

        if (leastPlayed.length > 0) {
          sections.push(
            "",
            `--- Least Played (under ${minutesToHours(LEAST_PLAYED_THRESHOLD_MINUTES)} hours) ---`,
            ...leastPlayed.map((g) => formatGame(g, false))
          );
        }

        if (neverPlayed.length > 0) {
          sections.push(
            "",
            `--- Never Played ---`,
            ...neverPlayed.map((g) => `  ${g.name} (appid: ${g.appid})`)
          );
        }

        return {
          content: [{ type: "text" as const, text: sections.join("\n") }],
        };
      } catch (error) {
        const message =
          error instanceof Error ? error.message : String(error);
        return {
          content: [{ type: "text" as const, text: `Error: ${message}` }],
          isError: true,
        };
      }
    }
  );
}
```

- [ ] **Step 2: Run tests to verify they pass**

Run: `npx vitest run src/tools/get-playtime-analytics.test.ts`
Expected: All 5 tests PASS

- [ ] **Step 3: Commit implementation**

```bash
git add src/tools/get-playtime-analytics.ts
git commit -m "feat: add get-playtime-analytics tool

Closes #14"
```

---

### Task 3: Register the tool in `index.ts`

**Files:**
- Modify: `src/index.ts`

- [ ] **Step 1: Add import and registration**

Add after the `registerGetNews` import (line 11):

```typescript
import { registerGetPlaytimeAnalytics } from "./tools/get-playtime-analytics.js";
```

Add after `registerGetNews(server, prefix);` (line 28):

```typescript
registerGetPlaytimeAnalytics(server, prefix);
```

- [ ] **Step 2: Run typecheck and lint**

Run: `npm run typecheck && npm run lint`
Expected: No errors

- [ ] **Step 3: Run full test suite**

Run: `npm test`
Expected: All tests pass

- [ ] **Step 4: Commit**

```bash
git add src/index.ts
git commit -m "feat: register get-playtime-analytics in server"
```

---

### Task 4: Docs reconciliation — README.md

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Add `get-playtime-analytics` to the tools table**

Insert a new row before `get-current-players` in the tools table:

```markdown
| `get-playtime-analytics` | Library playtime summary: recently played, most played, least played, and never played | Yes |
```

- [ ] **Step 2: Update environment variables table**

In the `STEAM_API_KEY` description, add `get-playtime-analytics` to the list of tools requiring it. Change:

```
required for `search-apps`, `get-games`, `get-recent-games`, `get-player-summaries`, `get-friend-list`, and `get-player-achievements`
```

to:

```
required for `search-apps`, `get-games`, `get-recent-games`, `get-player-summaries`, `get-friend-list`, `get-player-achievements`, and `get-playtime-analytics`
```

- [ ] **Step 3: Add example queries**

Add to the Example Queries section:

```markdown
- "Analyze my Steam library playtime" → `get-playtime-analytics`
- "What games have I never played?" → `get-playtime-analytics`
```

- [ ] **Step 4: Verify existing tool descriptions match implementation**

Audit each row in the tools table against the actual tool description strings in the source. Fix any discrepancies. Current descriptions to verify:
- `search-apps`: "Fuzzy search Steam apps by name" — matches `search-apps.ts` (uses Fuse.js fuzzy search). OK.
- `get-store-details`: "Pricing, descriptions, screenshots, system requirements" — matches. OK.
- `get-games`: "All games owned by a Steam user" — matches. OK.
- `get-recent-games`: "Games played in the last 2 weeks" — matches. OK.
- `get-player-summaries`: "Profile info, online status, avatar, and currently playing game (up to 100 IDs)" — matches. OK.
- `get-friend-list`: "Friend list with display names, Steam IDs, and friend-since dates (public profiles only)" — matches. OK.
- `get-player-achievements`: "Achievement progress with unlock times and global unlock percentages" — matches. OK.
- `get-current-players`: "Current number of in-game players" — matches. OK.
- `get-news`: "Latest news articles and patch notes" — matches. OK.

- [ ] **Step 5: Commit**

```bash
git add README.md
git commit -m "docs: add get-playtime-analytics to README and reconcile tool docs

Closes #9"
```

---

### Task 5: Docs reconciliation — CLAUDE.md

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Update tool count**

Change all instances of "9" referring to tool count to "10":
- "**Tools**: 9 registered tools for Steam API access" → "**Tools**: 10 registered tools for Steam API access"
- In `src/index.ts` description: "Server init, tool registration, stdio transport" — this line doesn't mention a count, no change needed.

- [ ] **Step 2: Add file to project structure**

In the `src/tools/` section of the project structure, add:

```
│       ├── get-playtime-analytics.ts   # + get-playtime-analytics.test.ts
```

Insert it alphabetically among the tool files (after `get-player-summaries.ts`, before `get-current-players.ts`).

- [ ] **Step 3: Add to tools table**

Insert a new row in the CLAUDE.md tools table:

```markdown
| `get-playtime-analytics` | Yes | Library playtime summary with four categories: recently played, most played, least played, never played |
```

- [ ] **Step 4: Verify existing CLAUDE.md content matches implementation**

Quick audit:
- Check the project structure section matches actual files on disk.
- Check the commands table matches `package.json` scripts.
- Check the environment variables table is accurate.
- Fix any drift found.

- [ ] **Step 5: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: update CLAUDE.md for get-playtime-analytics and reconcile with implementation"
```

---

### Task 6: Final validation

- [ ] **Step 1: Run full quality gates**

```bash
npm run typecheck && npm run lint && npm test && npm run build
```

Expected: All pass with no errors.

- [ ] **Step 2: Verify Docker build**

```bash
docker build -t steam-mcp-test .
```

Expected: Build succeeds.

- [ ] **Step 3: Review all changes**

```bash
git log --oneline master..HEAD
git diff master...HEAD --stat
```

Verify: 5-6 commits covering tests, implementation, registration, README, and CLAUDE.md.
