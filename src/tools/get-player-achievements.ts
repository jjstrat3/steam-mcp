import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  fetchPlayerAchievements,
  fetchGlobalAchievementPercentages,
  PlayerAchievementsUnavailableError,
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

        let achievements: Awaited<ReturnType<typeof fetchPlayerAchievements>>;
        try {
          achievements = await fetchPlayerAchievements(
            apiKey,
            userId,
            appid,
            language
          );
        } catch (error) {
          if (error instanceof PlayerAchievementsUnavailableError) {
            return {
              content: [
                {
                  type: "text" as const,
                  text:
                    `Error: Steam did not provide achievement data for app ${appid} ` +
                    `(Steam ID: ${userId}). The profile may be private, the game ` +
                    `may not expose achievements, or Steam may be temporarily unavailable.`,
                },
              ],
              isError: true,
            };
          }

          throw error;
        }

        if (achievements.length === 0) {
          return {
            content: [
              {
                type: "text" as const,
                text:
                  `No achievement entries were returned for app ${appid} ` +
                  `(Steam ID: ${userId}). Steam returned an empty dataset, ` +
                  `so the game may have no achievements or no visible player ` +
                  `achievement data was available.`,
              },
            ],
          };
        }

        // Fetch global percentages for enrichment (best-effort)
        const globalMap = new Map<string, number>();
        let globalPercentagesUnavailable = false;
        try {
          const globals = await fetchGlobalAchievementPercentages(appid);
          for (const g of globals) {
            globalMap.set(g.name, g.percent);
          }
        } catch {
          globalPercentagesUnavailable = true;
        }

        const unlocked = achievements.filter((a) => a.achieved === 1);
        const locked = achievements.filter((a) => a.achieved === 0);
        const missingGlobalPercentages = achievements.filter(
          (achievement) => !globalMap.has(achievement.apiname)
        ).length;

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

        if (globalPercentagesUnavailable) {
          lines.push(
            "Note: Global unlock percentages are temporarily unavailable. Achievement progress is shown without rarity enrichment.",
            ""
          );
        } else if (missingGlobalPercentages === achievements.length) {
          lines.push(
            "Note: Steam returned achievement progress, but global unlock percentages were unavailable for all achievements.",
            ""
          );
        } else if (missingGlobalPercentages > 0) {
          lines.push(
            `Note: Global unlock percentages were unavailable for ${missingGlobalPercentages} of ${achievements.length} achievements. Those entries are shown without rarity data.`,
            ""
          );
        }

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
