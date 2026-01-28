import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { searchApps } from "../cache.js";

export function registerSearchApps(server: McpServer, prefix: string): void {
  server.tool(
    `${prefix}search-apps`,
    "Search for Steam games by name using fuzzy matching. Handles typos, partial names, and variations. Returns top matching games with app IDs and similarity scores. Uses a cached list of ~240k Steam apps.",
    {
      query: z.string().describe("Search query to find Steam apps by name"),
      limit: z
        .number()
        .min(1)
        .max(50)
        .default(10)
        .describe("Maximum number of results to return (1-50, default 10)"),
    },
    async ({ query, limit }) => {
      try {
        const results = await searchApps(query, limit);

        if (results.length === 0) {
          return {
            content: [
              {
                type: "text" as const,
                text: `No apps found matching "${query}".`,
              },
            ],
          };
        }

        const lines = results.map(
          (r) =>
            `${r.app.name} (appid: ${r.app.appid}) - match: ${r.score}`
        );

        return {
          content: [
            {
              type: "text" as const,
              text: `Found ${results.length} result(s) for "${query}":\n\n${lines.join("\n")}`,
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
