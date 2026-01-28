# steam-mcp

MCP server for the Steam Web API. Provides tools for searching Steam games, fetching store details, and accessing player game libraries.

## Tools

| Tool | Description | Auth Required |
|------|-------------|---------------|
| `search-apps` | Fuzzy search Steam apps by name | Yes |
| `get-store-details` | Pricing, descriptions, screenshots, system requirements | No |
| `get-games` | All games owned by a Steam user | Yes |
| `get-recent-games` | Games played in the last 2 weeks | Yes |
| `get-player-summaries` | Profile info, online status, avatar, currently playing | Yes |
| `get-friend-list` | Friend list with display names and friend-since dates | Yes |
| `get-player-achievements` | Achievement progress with global unlock percentages | Yes |
| `get-current-players` | Current number of in-game players | No |
| `get-news` | Latest news articles and patch notes | No |

## Quick Start (Docker)

Pull the pre-built image from GitHub Container Registry:

```bash
docker pull ghcr.io/jjstrat3/steam-mcp:latest
docker run -i -e STEAM_API_KEY=your_key -e STEAM_USER_ID=your_id ghcr.io/jjstrat3/steam-mcp:latest
```

## Setup

### Get a Steam API Key

1. Go to https://steamcommunity.com/dev/apikey
2. Sign in and register for a key
3. Your account must have made at least one purchase or have $5+ in your Steam wallet

### Find Your 64-bit Steam ID

Your 64-bit Steam ID is the number in your Steam profile URL (e.g., `https://steamcommunity.com/profiles/76561198012345678`). If you use a custom URL, look up your ID at https://steamid.io.

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `STEAM_API_KEY` | Yes | Steam Web API key (required for `search-apps`, `get-games`, and `get-recent-games`) |
| `STEAM_USER_ID` | No | Default 64-bit Steam ID (can be overridden per-call) |
| `TOOL_PREFIX` | No | Prefix for tool names (e.g., `steam_` makes `steam_search-apps`) |

## Usage

### Local (Node.js)

```bash
npm install
npm run build
node build/index.js
```

### Docker

#### Pre-built Image (Recommended)

```bash
docker pull ghcr.io/jjstrat3/steam-mcp:latest
docker run -i -e STEAM_API_KEY=your_key -e STEAM_USER_ID=your_id ghcr.io/jjstrat3/steam-mcp:latest
```

#### Build Locally

```bash
docker build -t steam-mcp .
docker run -i -e STEAM_API_KEY=your_key -e STEAM_USER_ID=your_id steam-mcp
```

### Claude Desktop Configuration

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "steam": {
      "command": "node",
      "args": ["/absolute/path/to/steam-mcp/build/index.js"],
      "env": {
        "STEAM_API_KEY": "your_steam_api_key",
        "STEAM_USER_ID": "your_64bit_steam_id"
      }
    }
  }
}
```

Or with Docker (using pre-built image):

```json
{
  "mcpServers": {
    "steam": {
      "command": "docker",
      "args": ["run", "-i", "--rm", "-e", "STEAM_API_KEY=your_key", "-e", "STEAM_USER_ID=your_id", "ghcr.io/jjstrat3/steam-mcp:latest"]
    }
  }
}
```

### Testing with MCP Inspector

```bash
npm run build
npx @modelcontextprotocol/inspector build/index.js
```

## Example Queries

- "Find the app ID for Stardew Valley" → `search-apps`
- "What's the price for Baldur's Gate 3?" → `search-apps` + `get-store-details`
- "Show me system requirements for Cyberpunk 2077" → `search-apps` + `get-store-details`
- "What games have I been playing recently?" → `get-recent-games`
- "What's my most-played game?" → `get-games`
- "What's my Steam profile?" → `get-player-summaries`
- "Is my friend online right now?" → `get-player-summaries`
- "Who are my Steam friends?" → `get-friend-list`
- "What achievements have I unlocked in Elden Ring?" → `search-apps` + `get-player-achievements`
- "What are the rarest achievements I've earned in Hollow Knight?" → `search-apps` + `get-player-achievements`
- "How many people are playing CS2 right now?" → `search-apps` + `get-current-players`
- "What's the latest news for Factorio?" → `search-apps` + `get-news`
