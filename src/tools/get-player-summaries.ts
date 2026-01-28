import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { fetchPlayerSummaries } from "../steam-api.js";

const PERSONA_STATES: Record<number, string> = {
  0: "Offline",
  1: "Online",
  2: "Busy",
  3: "Away",
  4: "Snooze",
  5: "Looking to Trade",
  6: "Looking to Play",
};

export function registerGetPlayerSummaries(
  server: McpServer,
  prefix: string
): void {
  server.tool(
    `${prefix}get-player-summaries`,
    "Get Steam profile information for one or more users. Returns display name, avatar, online status, currently playing game, and more. Accepts up to 100 Steam IDs.",
    {
      steamids: z
        .string()
        .optional()
        .describe(
          "Comma-delimited list of 64-bit Steam IDs (up to 100). Defaults to STEAM_USER_ID environment variable if not provided."
        ),
    },
    async ({ steamids }) => {
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

        const ids = steamids || process.env.STEAM_USER_ID;
        if (!ids) {
          return {
            content: [
              {
                type: "text" as const,
                text: "Error: No Steam IDs provided. Pass a steamids argument or set the STEAM_USER_ID environment variable.",
              },
            ],
            isError: true,
          };
        }

        const idList = ids.split(",").map((id) => id.trim());
        const players = await fetchPlayerSummaries(apiKey, idList);

        if (players.length === 0) {
          return {
            content: [
              {
                type: "text" as const,
                text: "No player profiles found for the provided Steam IDs.",
              },
            ],
          };
        }

        const summaries = players.map((p) => {
          const lines: string[] = [
            `**${p.personaname}** (${p.steamid})`,
            `  Status: ${PERSONA_STATES[p.personastate] ?? "Unknown"}`,
            `  Profile: ${p.profileurl}`,
            `  Avatar: ${p.avatarfull}`,
          ];

          if (p.communityvisibilitystate === 3) {
            if (p.realname) lines.push(`  Real Name: ${p.realname}`);
            if (p.gameextrainfo)
              lines.push(`  Currently Playing: ${p.gameextrainfo}`);
            if (p.timecreated) {
              const created = new Date(p.timecreated * 1000).toLocaleDateString();
              lines.push(`  Account Created: ${created}`);
            }
            if (p.loccountrycode)
              lines.push(`  Country: ${p.loccountrycode}`);
          } else {
            lines.push(`  Profile Visibility: Private`);
          }

          if (p.lastlogoff) {
            const lastOnline = new Date(
              p.lastlogoff * 1000
            ).toLocaleString();
            lines.push(`  Last Online: ${lastOnline}`);
          }

          return lines.join("\n");
        });

        return {
          content: [
            {
              type: "text" as const,
              text: summaries.join("\n\n"),
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
