import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { fetchStoreDetails } from "../steam-api.js";

function formatPrice(data: {
  is_free: boolean;
  price_overview?: {
    currency: string;
    final: number;
    initial: number;
    discount_percent: number;
    final_formatted: string;
    initial_formatted: string;
  };
}): string {
  if (data.is_free) return "Free to Play";
  if (!data.price_overview) return "Price not available";

  const p = data.price_overview;
  if (p.discount_percent > 0) {
    return `${p.final_formatted} (${p.discount_percent}% off, was ${p.initial_formatted})`;
  }
  return p.final_formatted;
}

function formatRequirements(
  reqs: { minimum?: string; recommended?: string } | [] | undefined
): string {
  if (!reqs || Array.isArray(reqs)) return "Not specified";
  const parts: string[] = [];
  if (reqs.minimum) parts.push(`Minimum: ${stripHtml(reqs.minimum)}`);
  if (reqs.recommended)
    parts.push(`Recommended: ${stripHtml(reqs.recommended)}`);
  return parts.length > 0 ? parts.join("\n") : "Not specified";
}

function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

export function registerGetStoreDetails(
  server: McpServer,
  prefix: string
): void {
  server.tool(
    `${prefix}get-store-details`,
    "Fetch comprehensive store information for a Steam game including pricing, descriptions, screenshots, videos, system requirements, and reviews. Supports region-specific pricing. No Steam API key required.",
    {
      appid: z.number().describe("Steam application ID"),
      cc: z
        .string()
        .length(2)
        .optional()
        .describe(
          "Two-letter country code for regional pricing (e.g., 'us', 'gb', 'de')"
        ),
      language: z
        .string()
        .optional()
        .describe(
          "Language for descriptions (e.g., 'english', 'french', 'german')"
        ),
    },
    async ({ appid, cc, language }) => {
      try {
        const data = await fetchStoreDetails(appid, cc, language);

        if (!data) {
          return {
            content: [
              {
                type: "text" as const,
                text: `App ${appid} not found or store page unavailable.`,
              },
            ],
            isError: true,
          };
        }

        const platforms = [
          data.platforms.windows ? "Windows" : null,
          data.platforms.mac ? "macOS" : null,
          data.platforms.linux ? "Linux" : null,
        ]
          .filter(Boolean)
          .join(", ");

        const sections: string[] = [
          `# ${data.name}`,
          `**Type:** ${data.type}`,
          `**App ID:** ${data.steam_appid}`,
          `**Price:** ${formatPrice(data)}`,
          `**Platforms:** ${platforms}`,
          `**Store Page:** https://store.steampowered.com/app/${data.steam_appid}`,
        ];

        if (data.short_description) {
          sections.push(`\n**Description:** ${stripHtml(data.short_description)}`);
        }

        if (data.developers?.length) {
          sections.push(`**Developers:** ${data.developers.join(", ")}`);
        }
        if (data.publishers?.length) {
          sections.push(`**Publishers:** ${data.publishers.join(", ")}`);
        }

        if (data.genres?.length) {
          sections.push(
            `**Genres:** ${data.genres.map((g) => g.description).join(", ")}`
          );
        }
        if (data.categories?.length) {
          sections.push(
            `**Categories:** ${data.categories.map((c) => c.description).join(", ")}`
          );
        }

        if (data.metacritic) {
          sections.push(`**Metacritic:** ${data.metacritic.score}/100`);
        }
        if (data.recommendations) {
          sections.push(
            `**Recommendations:** ${data.recommendations.total.toLocaleString()}`
          );
        }

        if (data.release_date) {
          const status = data.release_date.coming_soon
            ? " (Coming Soon)"
            : "";
          sections.push(
            `**Release Date:** ${data.release_date.date}${status}`
          );
        }

        if (data.supported_languages) {
          sections.push(
            `**Languages:** ${stripHtml(data.supported_languages)}`
          );
        }

        if (data.controller_support) {
          sections.push(`**Controller Support:** ${data.controller_support}`);
        }

        if (data.required_age > 0) {
          sections.push(`**Required Age:** ${data.required_age}+`);
        }

        // System requirements
        const pcReqs = formatRequirements(data.pc_requirements);
        if (pcReqs !== "Not specified") {
          sections.push(`\n**PC Requirements:**\n${pcReqs}`);
        }
        const macReqs = formatRequirements(data.mac_requirements);
        if (macReqs !== "Not specified") {
          sections.push(`\n**Mac Requirements:**\n${macReqs}`);
        }
        const linuxReqs = formatRequirements(data.linux_requirements);
        if (linuxReqs !== "Not specified") {
          sections.push(`\n**Linux Requirements:**\n${linuxReqs}`);
        }

        if (data.website) {
          sections.push(`**Website:** ${data.website}`);
        }

        if (data.header_image) {
          sections.push(`**Header Image:** ${data.header_image}`);
        }

        if (data.screenshots?.length) {
          const shots = data.screenshots
            .slice(0, 5)
            .map((s) => s.path_full)
            .join("\n");
          sections.push(`\n**Screenshots:**\n${shots}`);
        }

        if (data.movies?.length) {
          const vids = data.movies
            .slice(0, 3)
            .map((m) => `${m.name}: ${m.mp4?.max || m.webm?.max || m.thumbnail}`)
            .join("\n");
          sections.push(`\n**Videos:**\n${vids}`);
        }

        return {
          content: [{ type: "text" as const, text: sections.join("\n") }],
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
