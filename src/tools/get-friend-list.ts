import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { fetchFriendList, fetchPlayerSummaries } from "../steam-api.js";

export function registerGetFriendList(
  server: McpServer,
  prefix: string
): void {
  server.tool(
    `${prefix}get-friend-list`,
    "Get the friend list for a Steam user. Returns friend display names, Steam IDs, and when they became friends. Only works if the user's profile is public.",
    {
      steamid: z
        .string()
        .optional()
        .describe(
          "64-bit Steam ID of the user. Defaults to STEAM_USER_ID environment variable if not provided."
        ),
      relationship: z
        .enum(["all", "friend"])
        .optional()
        .describe(
          'Relationship filter. "friend" (default) returns only friends, "all" returns all relationships.'
        ),
    },
    async ({ steamid, relationship }) => {
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

        const friends = await fetchFriendList(apiKey, userId, relationship);

        if (friends.length === 0) {
          return {
            content: [
              {
                type: "text" as const,
                text: `No friends found for Steam ID ${userId}. The profile may be private or the friend list may be empty.`,
              },
            ],
          };
        }

        // Batch-fetch player summaries to get display names (100 per batch)
        const nameMap = new Map<string, string>();
        for (let i = 0; i < friends.length; i += 100) {
          const batch = friends.slice(i, i + 100);
          const ids = batch.map((f) => f.steamid);
          try {
            const summaries = await fetchPlayerSummaries(apiKey, ids);
            for (const s of summaries) {
              nameMap.set(s.steamid, s.personaname);
            }
          } catch {
            // If enrichment fails, continue without names
          }
        }

        const lines = friends.map((f) => {
          const name = nameMap.get(f.steamid) ?? "Unknown";
          const since = new Date(f.friend_since * 1000).toLocaleDateString();
          return `${name} (${f.steamid}) - Friends since ${since}`;
        });

        return {
          content: [
            {
              type: "text" as const,
              text: `${friends.length} friends for Steam ID ${userId}:\n\n${lines.join("\n")}`,
            },
          ],
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
