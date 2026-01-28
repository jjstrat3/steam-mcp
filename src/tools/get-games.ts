import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { fetchOwnedGames } from "../steam-api.js";

function minutesToHours(minutes: number): string {
  return (minutes / 60).toFixed(1);
}

export function registerGetGames(server: McpServer, prefix: string): void {
  server.tool(
    `${prefix}get-games`,
    "Retrieve all games owned by a Steam user. Returns game names, App IDs, and total playtime in hours. Requires STEAM_API_KEY environment variable.",
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

        // Sort by playtime descending
        games.sort((a, b) => b.playtime_forever - a.playtime_forever);

        const lines = games.map(
          (g) =>
            `${g.name} (appid: ${g.appid}) - ${minutesToHours(g.playtime_forever)} hours`
        );

        return {
          content: [
            {
              type: "text" as const,
              text: `${games.length} games owned by Steam ID ${userId}:\n\n${lines.join("\n")}`,
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
