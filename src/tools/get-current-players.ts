import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { fetchCurrentPlayers } from "../steam-api.js";

export function registerGetCurrentPlayers(
  server: McpServer,
  prefix: string
): void {
  server.tool(
    `${prefix}get-current-players`,
    "Get the current number of players in a Steam game. Does not require an API key.",
    {
      appid: z.number().describe("Steam application ID of the game."),
    },
    async ({ appid }) => {
      try {
        const count = await fetchCurrentPlayers(appid);

        return {
          content: [
            {
              type: "text" as const,
              text: `App ${appid} currently has ${count.toLocaleString()} players in-game on Steam.`,
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
