import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  fetchPlayerAchievements,
  fetchGlobalAchievementPercentages,
} from "../steam-api.js";

export function registerGetPlayerAchievements(
  server: McpServer,
  prefix: string
): void {
  server.tool(
    `${prefix}get-player-achievements`,
    "Get a player's achievements for a specific game. Shows which achievements are unlocked, unlock times, and global unlock percentages. Requires STEAM_API_KEY.",
    {
      appid: z.number().describe("Steam application ID of the game."),
      steamid: z
        .string()
        .optional()
        .describe(
          "64-bit Steam ID of the user. Defaults to STEAM_USER_ID environment variable if not provided."
        ),
      language: z
        .string()
        .optional()
        .describe(
          "Language code for localized achievement names and descriptions (e.g., 'english', 'french', 'german')."
        ),
    },
    async ({ appid, steamid, language }) => {
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

        const achievements = await fetchPlayerAchievements(
          apiKey,
          userId,
          appid,
          language
        );

        if (achievements.length === 0) {
          return {
            content: [
              {
                type: "text" as const,
                text: `No achievements found for app ${appid}. The game may have no achievements.`,
              },
            ],
          };
        }

        // Fetch global percentages for enrichment (best-effort)
        const globalMap = new Map<string, number>();
        try {
          const globals = await fetchGlobalAchievementPercentages(appid);
          for (const g of globals) {
            globalMap.set(g.name, g.percent);
          }
        } catch {
          // If global percentages fail, continue without them
        }

        const unlocked = achievements.filter((a) => a.achieved === 1);
        const locked = achievements.filter((a) => a.achieved === 0);

        const formatAchievement = (a: (typeof achievements)[0]) => {
          const status = a.achieved === 1 ? "UNLOCKED" : "LOCKED";
          const name = a.name ?? a.apiname;
          const desc = a.description ? ` - ${a.description}` : "";
          const globalPct = globalMap.get(a.apiname);
          const pctStr =
            globalPct !== undefined
              ? ` (${Number(globalPct).toFixed(1)}% of players)`
              : "";
          const unlockTime =
            a.achieved === 1 && a.unlocktime > 0
              ? ` [${new Date(a.unlocktime * 1000).toLocaleDateString()}]`
              : "";
          return `[${status}] ${name}${desc}${pctStr}${unlockTime}`;
        };

        const lines: string[] = [
          `Achievements for app ${appid} (Steam ID: ${userId})`,
          `Progress: ${unlocked.length}/${achievements.length} (${((unlocked.length / achievements.length) * 100).toFixed(1)}%)`,
          "",
        ];

        if (unlocked.length > 0) {
          lines.push(`--- Unlocked (${unlocked.length}) ---`);
          // Sort unlocked by unlock time descending (most recent first)
          unlocked.sort((a, b) => b.unlocktime - a.unlocktime);
          lines.push(...unlocked.map(formatAchievement));
        }

        if (locked.length > 0) {
          lines.push("", `--- Locked (${locked.length}) ---`);
          // Sort locked by global percentage descending (easiest first)
          locked.sort((a, b) => {
            const pctA = globalMap.get(a.apiname) ?? 0;
            const pctB = globalMap.get(b.apiname) ?? 0;
            return pctB - pctA;
          });
          lines.push(...locked.map(formatAchievement));
        }

        return {
          content: [
            {
              type: "text" as const,
              text: lines.join("\n"),
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
