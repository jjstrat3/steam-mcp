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

let nextAppId = 1;

function createGame(
  name: string,
  playtimeForever: number,
  playtime2weeks?: number
): OwnedGame {
  return {
    appid: nextAppId++,
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
    nextAppId = 1;
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
    expect(text).toContain("1050.7 hours"); // (60000+3000+30+10)/60 = 1050.667 → toFixed(1) = "1050.7"

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
