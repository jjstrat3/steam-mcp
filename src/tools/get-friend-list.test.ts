import { beforeEach, describe, expect, it, vi } from "vitest";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Friend, PlayerSummary } from "../types.js";

vi.mock("../steam-api.js", () => ({
  fetchFriendList: vi.fn(),
  fetchPlayerSummaries: vi.fn(),
}));

import {
  fetchFriendList,
  fetchPlayerSummaries,
} from "../steam-api.js";
import { registerGetFriendList } from "./get-friend-list.js";

interface ToolResponse {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
}

function createFriend(steamid: string, friendSince: number): Friend {
  return {
    steamid,
    relationship: "friend",
    friend_since: friendSince,
  };
}

function createPlayerSummary(
  steamid: string,
  personaname: string
): PlayerSummary {
  return {
    steamid,
    personaname,
    profileurl: `https://steamcommunity.com/profiles/${steamid}`,
    avatar: "avatar",
    avatarmedium: "avatarmedium",
    avatarfull: "avatarfull",
    personastate: 1,
    communityvisibilitystate: 3,
  };
}

function getHandler(): (
  args: { steamid?: string; relationship?: "all" | "friend" }
) => Promise<ToolResponse> {
  const tool = vi.fn();
  const server = { tool } as unknown as McpServer;
  registerGetFriendList(server, "");
  return tool.mock.calls[0][3] as (
    args: { steamid?: string; relationship?: "all" | "friend" }
  ) => Promise<ToolResponse>;
}

describe("get-friend-list tool", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    process.env.STEAM_API_KEY = "test-key";
    delete process.env.STEAM_USER_ID;
  });

  it("surfaces a degraded notice when summary enrichment fails", async () => {
    vi.mocked(fetchFriendList).mockResolvedValueOnce([
      createFriend("123", 1_700_000_000),
    ]);
    vi.mocked(fetchPlayerSummaries).mockRejectedValueOnce(
      new Error("temporary failure")
    );

    const handler = getHandler();
    const result = await handler({ steamid: "owner-id" });

    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toContain(
      "display-name enrichment is temporarily unavailable"
    );
    expect(result.content[0].text).toContain("Unknown (123)");
  });

  it("surfaces a partial notice when Steam returns only some display names", async () => {
    vi.mocked(fetchFriendList).mockResolvedValueOnce([
      createFriend("123", 1_700_000_000),
      createFriend("456", 1_700_000_100),
    ]);
    vi.mocked(fetchPlayerSummaries).mockResolvedValueOnce([
      createPlayerSummary("123", "Alice"),
    ]);

    const handler = getHandler();
    const result = await handler({ steamid: "owner-id" });

    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toContain(
      "display names were unavailable for 1 of 2 friends"
    );
    expect(result.content[0].text).toContain("Alice (123)");
    expect(result.content[0].text).toContain("Unknown (456)");
  });
});
