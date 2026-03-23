import { beforeEach, describe, expect, it, vi } from "vitest";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { StoreData, PlayerAchievement } from "../types.js";

vi.mock("../cache.js", () => ({
  searchApps: vi.fn(),
}));

vi.mock("../steam-api.js", () => ({
  fetchStoreDetails: vi.fn(),
  fetchOwnedGames: vi.fn(),
  fetchPlayerAchievements: vi.fn(),
  fetchGlobalAchievementPercentages: vi.fn(),
  PlayerAchievementsUnavailableError: class PlayerAchievementsUnavailableError extends Error {
    constructor() {
      super("Could not retrieve achievements.");
      this.name = "PlayerAchievementsUnavailableError";
    }
  },
}));

import { searchApps } from "../cache.js";
import {
  fetchStoreDetails,
  fetchOwnedGames,
  fetchPlayerAchievements,
  fetchGlobalAchievementPercentages,
  PlayerAchievementsUnavailableError,
} from "../steam-api.js";
import { registerSearchApps } from "./search-apps.js";
import { registerGetStoreDetails } from "./get-store-details.js";
import { registerGetGames } from "./get-games.js";
import { registerGetPlayerAchievements } from "./get-player-achievements.js";

interface ToolResponse {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
}

// --- Handler extraction helpers (same pattern as get-friend-list.test.ts) ---

function getSearchHandler(): (args: {
  query: string;
  limit: number;
}) => Promise<ToolResponse> {
  const tool = vi.fn();
  const server = { tool } as unknown as McpServer;
  registerSearchApps(server, "");
  return tool.mock.calls[0][3] as (args: {
    query: string;
    limit: number;
  }) => Promise<ToolResponse>;
}

function getStoreHandler(): (args: {
  appid: number;
  cc?: string;
  language?: string;
}) => Promise<ToolResponse> {
  const tool = vi.fn();
  const server = { tool } as unknown as McpServer;
  registerGetStoreDetails(server, "");
  return tool.mock.calls[0][3] as (args: {
    appid: number;
    cc?: string;
    language?: string;
  }) => Promise<ToolResponse>;
}

function getGamesHandler(): (args: {
  steamid?: string;
}) => Promise<ToolResponse> {
  const tool = vi.fn();
  const server = { tool } as unknown as McpServer;
  registerGetGames(server, "");
  return tool.mock.calls[0][3] as (args: {
    steamid?: string;
  }) => Promise<ToolResponse>;
}

function getAchievementsHandler(): (args: {
  appid: number;
  steamid?: string;
  language?: string;
}) => Promise<ToolResponse> {
  const tool = vi.fn();
  const server = { tool } as unknown as McpServer;
  registerGetPlayerAchievements(server, "");
  return tool.mock.calls[0][3] as (args: {
    appid: number;
    steamid?: string;
    language?: string;
  }) => Promise<ToolResponse>;
}

// --- Fixtures ---

const STORE_DATA: StoreData = {
  type: "game",
  name: "Counter-Strike 2",
  steam_appid: 730,
  required_age: 0,
  is_free: true,
  detailed_description: "Detailed desc",
  about_the_game: "About the game",
  short_description: "A competitive FPS",
  header_image: "https://cdn.example.com/header.jpg",
  website: null,
  developers: ["Valve"],
  publishers: ["Valve"],
  platforms: { windows: true, mac: true, linux: true },
  genres: [{ id: "1", description: "Action" }],
  categories: [{ id: 1, description: "Multi-player" }],
};

function createAchievement(
  apiname: string,
  achieved: number,
  unlocktime: number
): PlayerAchievement {
  return {
    apiname,
    achieved,
    unlocktime,
    name: apiname,
    description: `${apiname} description`,
  };
}

// --- Tests ---

describe("workflow: search-apps → get-store-details", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    process.env.STEAM_API_KEY = "test-key";
  });

  it("finds a game by name then retrieves its store details", async () => {
    // Step 1: search for a game
    vi.mocked(searchApps).mockResolvedValueOnce([
      { app: { name: "Counter-Strike 2", appid: 730 }, score: 0.95 },
    ]);

    const searchHandler = getSearchHandler();
    const searchResult = await searchHandler({
      query: "Counter-Strike",
      limit: 5,
    });

    expect(searchResult.isError).toBeUndefined();
    expect(searchResult.content[0].type).toBe("text");
    expect(searchResult.content[0].text).toContain("Counter-Strike 2");
    expect(searchResult.content[0].text).toContain("appid: 730");
    expect(searchResult.content[0].text).toContain("match: 0.95");

    // Step 2: use the appid from the search to fetch store details
    vi.mocked(fetchStoreDetails).mockResolvedValueOnce(STORE_DATA);

    const storeHandler = getStoreHandler();
    const storeResult = await storeHandler({ appid: 730 });

    expect(storeResult.isError).toBeUndefined();
    expect(storeResult.content[0].type).toBe("text");
    expect(storeResult.content[0].text).toContain("# Counter-Strike 2");
    expect(storeResult.content[0].text).toContain("Free to Play");
    expect(storeResult.content[0].text).toContain("Windows");
    expect(storeResult.content[0].text).toContain("macOS");
    expect(storeResult.content[0].text).toContain("Linux");
    expect(storeResult.content[0].text).toContain("Valve");
    expect(storeResult.content[0].text).toContain("Action");
    expect(storeResult.content[0].text).toContain(
      "https://store.steampowered.com/app/730"
    );
  });

  it("handles search success but store page unavailable", async () => {
    // Step 1: search succeeds
    vi.mocked(searchApps).mockResolvedValueOnce([
      { app: { name: "Removed Game", appid: 99999 }, score: 0.9 },
    ]);

    const searchHandler = getSearchHandler();
    const searchResult = await searchHandler({
      query: "Removed Game",
      limit: 5,
    });

    expect(searchResult.isError).toBeUndefined();
    expect(searchResult.content[0].text).toContain("Removed Game");
    expect(searchResult.content[0].text).toContain("appid: 99999");

    // Step 2: store details returns null (unavailable)
    vi.mocked(fetchStoreDetails).mockResolvedValueOnce(null);

    const storeHandler = getStoreHandler();
    const storeResult = await storeHandler({ appid: 99999 });

    expect(storeResult.isError).toBe(true);
    expect(storeResult.content[0].text).toContain(
      "not found or store page unavailable"
    );
  });
});

describe("workflow: get-games → get-player-achievements", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    process.env.STEAM_API_KEY = "test-key";
    delete process.env.STEAM_USER_ID;
  });

  it("lists owned games then retrieves achievements for the top game", async () => {
    // Step 1: fetch owned games
    vi.mocked(fetchOwnedGames).mockResolvedValueOnce([
      { appid: 440, name: "Team Fortress 2", playtime_forever: 12000 },
      { appid: 570, name: "Dota 2", playtime_forever: 60000 },
    ]);

    const gamesHandler = getGamesHandler();
    const gamesResult = await gamesHandler({ steamid: "player1" });

    expect(gamesResult.isError).toBeUndefined();
    expect(gamesResult.content[0].type).toBe("text");
    expect(gamesResult.content[0].text).toContain("2 games owned");
    // Dota 2 has more playtime, so it should appear first in sorted output
    const text = gamesResult.content[0].text;
    const dotaIdx = text.indexOf("Dota 2");
    const tf2Idx = text.indexOf("Team Fortress 2");
    expect(dotaIdx).toBeGreaterThanOrEqual(0);
    expect(tf2Idx).toBeGreaterThanOrEqual(0);
    expect(dotaIdx).toBeLessThan(tf2Idx);
    expect(text).toContain("appid: 570");
    expect(text).toContain("appid: 440");

    // Step 2: fetch achievements for the top game (Dota 2, appid 570)
    vi.mocked(fetchPlayerAchievements).mockResolvedValueOnce([
      createAchievement("FIRST_WIN", 1, 1_700_000_000),
      createAchievement("HARD_MODE", 0, 0),
    ]);
    vi.mocked(fetchGlobalAchievementPercentages).mockResolvedValueOnce([
      { name: "FIRST_WIN", percent: 80.5 },
      { name: "HARD_MODE", percent: 5.2 },
    ]);

    const achievementsHandler = getAchievementsHandler();
    const achievementsResult = await achievementsHandler({
      appid: 570,
      steamid: "player1",
    });

    expect(achievementsResult.isError).toBeUndefined();
    expect(achievementsResult.content[0].type).toBe("text");
    const achText = achievementsResult.content[0].text;
    expect(achText).toContain("Progress: 1/2 (50.0%)");
    expect(achText).toContain("[UNLOCKED] FIRST_WIN");
    expect(achText).toContain("[LOCKED] HARD_MODE");
    expect(achText).toContain("80.5% of players");
    expect(achText).toContain("5.2% of players");
  });

  it("handles games success but achievements unavailable", async () => {
    // Step 1: fetch owned games succeeds
    vi.mocked(fetchOwnedGames).mockResolvedValueOnce([
      { appid: 570, name: "Dota 2", playtime_forever: 60000 },
    ]);

    const gamesHandler = getGamesHandler();
    const gamesResult = await gamesHandler({ steamid: "player1" });

    expect(gamesResult.isError).toBeUndefined();
    expect(gamesResult.content[0].text).toContain("Dota 2");

    // Step 2: achievements throw PlayerAchievementsUnavailableError
    vi.mocked(fetchPlayerAchievements).mockRejectedValueOnce(
      new PlayerAchievementsUnavailableError()
    );

    const achievementsHandler = getAchievementsHandler();
    const achievementsResult = await achievementsHandler({
      appid: 570,
      steamid: "player1",
    });

    expect(achievementsResult.isError).toBe(true);
    expect(achievementsResult.content[0].text).toContain(
      "Steam did not provide achievement data"
    );
  });
});
