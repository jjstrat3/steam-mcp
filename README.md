# steam-mcp

MCP server for the Steam Web API. Provides tools for searching Steam games, fetching store details, and accessing player game libraries.

## Tools

| Tool | Description | Auth Required |
|------|-------------|---------------|
| `search-apps` | Fuzzy search Steam apps by name | Yes |
| `get-store-details` | Pricing, descriptions, screenshots, system requirements | No |
| `compare-regional-prices` | Compare Steam pricing across explicit country codes with currency-safe summaries | No |
| `get-games` | All games owned by a Steam user | Yes |
| `get-recent-games` | Games played in the last 2 weeks | Yes |
| `get-player-summaries` | Profile info, online status, avatar, and currently playing game (up to 100 IDs) | Yes |
| `get-friend-list` | Friend list with display names, Steam IDs, and friend-since dates (public profiles only) | Yes |
| `get-player-achievements` | Achievement progress with unlock times and global unlock percentages | Yes |
| `get-playtime-analytics` | Library playtime summary: recently played, most played, least played, and never played | Yes |
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
| `STEAM_API_KEY` | Some tools | Steam Web API key (required for `search-apps`, `get-games`, `get-recent-games`, `get-player-summaries`, `get-friend-list`, `get-player-achievements`, and `get-playtime-analytics`; optional for `get-store-details`, `compare-regional-prices`, `get-current-players`, and `get-news`) |
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

## Releasing

Use the `Create Release` GitHub Actions workflow with a `patch`, `minor`, or `major` bump when you want a one-click release from the default branch. The workflow updates `package.json` and `package-lock.json`, creates the matching `v*` tag, publishes the Docker image tags, and creates the GitHub Release.

Manual `v*` tag pushes still create a GitHub Release as before.

## Behavior Notes

- `compare-regional-prices` requires an explicit list of 2-10 country codes and only computes comparison deltas when regions share the same currency.
- `get-player-summaries` accepts up to 100 Steam IDs. Private profiles return a reduced field set instead of full profile details.
- `get-friend-list` only works for public profiles. If display-name enrichment fails, the tool still returns Steam IDs and friend-since dates with a notice.
- `get-player-achievements` still returns achievement progress when global unlock percentages are unavailable and notes when rarity enrichment is missing.

## Example Queries

- "Find the app ID for Stardew Valley" → `search-apps`
- "What's the price for Baldur's Gate 3?" → `search-apps` + `get-store-details`
- "Compare Hades pricing in the US, CA, and GB" → `compare-regional-prices`
- "Show me system requirements for Cyberpunk 2077" → `search-apps` + `get-store-details`
- "What games have I been playing recently?" → `get-recent-games`
- "What's my most-played game?" → `get-games`
- "What's my Steam profile?" → `get-player-summaries`
- "Is my friend online right now?" → `get-player-summaries`
- "Who are my Steam friends?" → `get-friend-list`
- "What achievements have I unlocked in Elden Ring?" → `search-apps` + `get-player-achievements`
- "Show my achievement progress in Hollow Knight" → `search-apps` + `get-player-achievements`
- "How many people are playing CS2 right now?" → `search-apps` + `get-current-players`
- "What's the latest news for Factorio?" → `search-apps` + `get-news`
- "Analyze my Steam library playtime" → `get-playtime-analytics`
- "What games have I never played?" → `get-playtime-analytics`
