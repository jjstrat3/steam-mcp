import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { fetchRecentGames } from "../steam-api.js";

function minutesToHours(minutes: number): string {
  return (minutes / 60).toFixed(1);
}

export function registerGetRecentGames(
  server: McpServer,
  prefix: string
): void {
  server.tool(
    `${prefix}get-recent-games`,
    "Retrieve games played by a Steam user in the last 2 weeks. Returns game names, App IDs, recent playtime, and total playtime in hours. Requires STEAM_API_KEY environment variable.",
    {
      steamid: z
        .string()
        .optional()
        .describe(
          "64-bit Steam ID of the user. Defaults to STEAM_USER_ID environment variable if not provided."
        ),
    },
    async ({ steamid }) => {
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

        const games = await fetchRecentGames(apiKey, userId);

        if (games.length === 0) {
          return {
            content: [
              {
                type: "text" as const,
                text: `No recently played games found for Steam ID ${userId}. The profile may be private or no games were played in the last 2 weeks.`,
              },
            ],
          };
        }

        // Sort by recent playtime descending
        games.sort((a, b) => b.playtime_2weeks - a.playtime_2weeks);

        const lines = games.map(
          (g) =>
            `${g.name} (appid: ${g.appid}) - ${minutesToHours(g.playtime_2weeks)} hours (last 2 weeks) / ${minutesToHours(g.playtime_forever)} hours (total)`
        );

        return {
          content: [
            {
              type: "text" as const,
              text: `${games.length} game(s) played recently by Steam ID ${userId}:\n\n${lines.join("\n")}`,
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
