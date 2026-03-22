import { beforeEach, describe, expect, it, vi } from "vitest";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { PlayerAchievement } from "../types.js";

vi.mock("../steam-api.js", () => ({
  fetchPlayerAchievements: vi.fn(),
  fetchGlobalAchievementPercentages: vi.fn(),
}));

import {
  fetchGlobalAchievementPercentages,
  fetchPlayerAchievements,
} from "../steam-api.js";
import { registerGetPlayerAchievements } from "./get-player-achievements.js";

interface ToolResponse {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
}

function createAchievement(
  apiname: string,
  achieved: number
): PlayerAchievement {
  return {
    apiname,
    achieved,
    unlocktime: achieved === 1 ? 1_700_000_000 : 0,
    name: apiname,
    description: `${apiname} description`,
  };
}

function getHandler(): (
  args: { appid: number; steamid?: string; language?: string }
) => Promise<ToolResponse> {
  const tool = vi.fn();
  const server = { tool } as unknown as McpServer;
  registerGetPlayerAchievements(server, "");
  return tool.mock.calls[0][3] as (
    args: { appid: number; steamid?: string; language?: string }
  ) => Promise<ToolResponse>;
}

describe("get-player-achievements tool", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    process.env.STEAM_API_KEY = "test-key";
    delete process.env.STEAM_USER_ID;
  });

  it("explains when Steam returns an empty achievement dataset", async () => {
    vi.mocked(fetchPlayerAchievements).mockResolvedValueOnce([]);

    const handler = getHandler();
    const result = await handler({ appid: 570, steamid: "owner-id" });

    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toContain(
      "Steam returned an empty dataset"
    );
  });

  it("adds a degraded notice when global rarity enrichment fails", async () => {
    vi.mocked(fetchPlayerAchievements).mockResolvedValueOnce([
      createAchievement("FIRST_WIN", 1),
      createAchievement("HARD_MODE", 0),
    ]);
    vi.mocked(fetchGlobalAchievementPercentages).mockRejectedValueOnce(
      new Error("temporary failure")
    );

    const handler = getHandler();
    const result = await handler({ appid: 570, steamid: "owner-id" });

    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toContain(
      "Global unlock percentages are temporarily unavailable"
    );
    expect(result.content[0].text).toContain("[UNLOCKED] FIRST_WIN");
    expect(result.content[0].text).toContain("[LOCKED] HARD_MODE");
  });

  it("returns a clearer MCP-friendly error when Steam does not provide achievement data", async () => {
    vi.mocked(fetchPlayerAchievements).mockRejectedValueOnce(
      new Error(
        "Could not retrieve achievements. The game may have no achievements, or the user's profile may be private."
      )
    );

    const handler = getHandler();
    const result = await handler({ appid: 570, steamid: "owner-id" });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain(
      "Steam did not provide achievement data"
    );
    expect(result.content[0].text).toContain("profile may be private");
  });

  it("calls out partially missing global percentages", async () => {
    vi.mocked(fetchPlayerAchievements).mockResolvedValueOnce([
      createAchievement("FIRST_WIN", 1),
      createAchievement("HARD_MODE", 0),
    ]);
    vi.mocked(fetchGlobalAchievementPercentages).mockResolvedValueOnce([
      { name: "FIRST_WIN", percent: 50 },
    ]);

    const handler = getHandler();
    const result = await handler({ appid: 570, steamid: "owner-id" });

    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toContain(
      "Global unlock percentages were unavailable for 1 of 2 achievements"
    );
    expect(result.content[0].text).toContain("(50.0% of players)");
  });
});
