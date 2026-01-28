import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { fetchNews } from "../steam-api.js";

export function registerGetNews(server: McpServer, prefix: string): void {
  server.tool(
    `${prefix}get-news`,
    "Get the latest news articles for a Steam game. Returns titles, URLs, content snippets, and dates. Does not require an API key.",
    {
      appid: z.number().describe("Steam application ID of the game."),
      count: z
        .number()
        .min(1)
        .max(50)
        .optional()
        .describe("Number of news entries to return (1-50, default 5)."),
      maxlength: z
        .number()
        .min(0)
        .optional()
        .describe(
          "Maximum length of each news entry's content. 0 returns full content. Default 500."
        ),
    },
    async ({ appid, count, maxlength }) => {
      try {
        const items = await fetchNews(appid, count, maxlength);

        if (items.length === 0) {
          return {
            content: [
              {
                type: "text" as const,
                text: `No news found for app ${appid}.`,
              },
            ],
          };
        }

        const articles = items.map((item) => {
          const date = new Date(item.date * 1000).toLocaleDateString();
          const author = item.author ? ` by ${item.author}` : "";
          const lines = [
            `**${item.title}**${author}`,
            `  Date: ${date} | Feed: ${item.feedlabel}`,
            `  URL: ${item.url}`,
          ];
          if (item.contents) {
            // Strip HTML tags for cleaner output
            const cleanContent = item.contents.replace(/<[^>]*>/g, "").trim();
            if (cleanContent) {
              lines.push(`  ${cleanContent}`);
            }
          }
          return lines.join("\n");
        });

        return {
          content: [
            {
              type: "text" as const,
              text: `Latest news for app ${appid}:\n\n${articles.join("\n\n")}`,
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
