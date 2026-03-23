# Playtime Analytics Tool + Docs Reconciliation

**Issues**: #9 (docs reconciliation), #14 (playtime analytics tool)
**Date**: 2026-03-23
**Delivery**: Single PR covering both issues

## Overview

Add a new `get-playtime-analytics` MCP tool that returns a comprehensive playtime summary of a user's Steam library, and reconcile README.md and CLAUDE.md with the current implementation (including the new tool).

## New Tool: `get-playtime-analytics`

### Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `steamid` | `z.string().optional().describe("64-bit Steam ID (defaults to STEAM_USER_ID env var)")` | No | `STEAM_USER_ID` env var | 64-bit Steam ID |
| `limit` | `z.number().min(1).max(50).optional().describe("Max games shown per category (1-50, default 10)")` | No | 10 | Max games per category |

### Auth

Requires `STEAM_API_KEY`.

### MCP Tool Description

"Summarize a Steam user's library playtime into categories: recently played, most played, least played, and never played"

### Data Source

Reuses `fetchOwnedGames()` from `steam-api.ts`. No new Steam API endpoints needed. The owned-games response already includes `playtime_forever` and `playtime_2weeks` fields.

### Output Categories

Output is plain text organized into sections, preceded by a summary header (total games owned, total playtime in hours formatted to one decimal place). Categories appear in this order:

1. **Recently Played** -- Games with `playtime_2weeks > 0`, sorted by 2-week playtime descending.
2. **Most Played** -- Top N by `playtime_forever`, sorted descending.
3. **Least Played** -- Games with `playtime_forever > 0` and under 120 minutes total, sorted ascending. The 120-minute threshold aligns with Steam's refund window.
4. **Never Played** -- Games with `playtime_forever === 0`, sorted alphabetically.

Each entry shows: game name, total hours, and 2-week hours where applicable. Categories with no matching games are omitted from output. Games may appear in multiple categories (e.g., a top most-played game that was also played recently appears in both "Recently Played" and "Most Played") since each category answers a different question.

The 120-minute threshold for "Least Played" should be extracted as a named constant (e.g., `LEAST_PLAYED_THRESHOLD_MINUTES = 120`).

### Error Handling

Follows existing tool patterns:
- Missing `STEAM_API_KEY` returns an error message.
- Missing Steam ID (no parameter and no env var) returns an error message.
- Empty library (zero games) returns a readable message, not an error.
- Private profile propagates the fetch error from `fetchOwnedGames`.

### Files

- `src/tools/get-playtime-analytics.ts` -- Tool registration and formatting logic.
- `src/tools/get-playtime-analytics.test.ts` -- Unit tests.
- `src/index.ts` -- Import and register the new tool.

### Decisions

- **No price-per-hour**: Pricing data for already-owned games is not meaningful, and fetching store details for hundreds of games would be slow and rate-limit-prone. The LLM can combine this tool with `get-store-details` for specific games if needed.
- **No "dormant" category**: The four categories (recently-played, most-played, least-played, never-played) cover the full spectrum without overlap.
- **Single comprehensive tool (not parameterized reports)**: LLMs extract what they need from structured text; one call avoids extra round-trips.

## Docs Reconciliation (Issue #9)

### README.md

- Add `get-playtime-analytics` to the tools table with auth requirement.
- Verify all existing tool descriptions match actual behavior.
- Ensure auth requirements column is accurate for all 10 tools.
- Add example queries for the new tool if applicable.

### CLAUDE.md

- Add `get-playtime-analytics` to project structure, tools table, and relevant sections.
- Update tool count from 9 to 10 wherever referenced.
- Ensure patterns and conventions sections still match the implementation.

### Scope Boundary

Only fix drift between docs and implementation. No rewriting for style or adding new sections beyond what is needed.

## Testing

Tests follow existing tool test patterns: mock `fetchOwnedGames` from `steam-api.js`, extract handler via `vi.fn()` and tool registration.

| Test Case | Description |
|-----------|-------------|
| Happy path | Library with mixed playtime games; all four categories populate and sort correctly |
| Empty library | Zero games owned; returns readable message, not an error |
| All never-played | Only "Never Played" section appears; assert other category headers are absent |
| Single game | Lands in the correct category |
| Limit parameter | Each category respects the limit cap |
