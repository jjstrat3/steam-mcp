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
