import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerSearchApps } from "./tools/search-apps.js";
import { registerGetStoreDetails } from "./tools/get-store-details.js";
import { registerGetGames } from "./tools/get-games.js";
import { registerGetRecentGames } from "./tools/get-recent-games.js";
import { registerGetPlayerSummaries } from "./tools/get-player-summaries.js";
import { registerGetFriendList } from "./tools/get-friend-list.js";
import { registerGetPlayerAchievements } from "./tools/get-player-achievements.js";
import { registerGetCurrentPlayers } from "./tools/get-current-players.js";
import { registerGetNews } from "./tools/get-news.js";

const prefix = process.env.TOOL_PREFIX ?? "";

const server = new McpServer({
  name: "steam-mcp",
  version: "1.0.0",
});

registerSearchApps(server, prefix);
registerGetStoreDetails(server, prefix);
registerGetGames(server, prefix);
registerGetRecentGames(server, prefix);
registerGetPlayerSummaries(server, prefix);
registerGetFriendList(server, prefix);
registerGetPlayerAchievements(server, prefix);
registerGetCurrentPlayers(server, prefix);
registerGetNews(server, prefix);

const transport = new StdioServerTransport();
await server.connect(transport);
console.error("Steam MCP server running on stdio");
