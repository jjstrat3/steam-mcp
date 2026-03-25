import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { fetchStoreDetails } from "../steam-api.js";
import type { StoreData } from "../types.js";

type RegionResult =
  | { country: string; kind: "ok"; data: StoreData }
  | { country: string; kind: "missing" }
  | { country: string; kind: "error"; error: string };

interface PaidRegion {
  country: string;
  currency: string;
  final: number;
  formatted: string;
}

function normalizeCountryCodes(countries: string[]): string[] {
  return [...new Set(countries.map((country) => country.trim().toUpperCase()))];
}

function formatRegionPrice(data: StoreData): string {
  if (data.is_free) {
    return "Free to Play";
  }

  if (!data.price_overview) {
    return "Price not available";
  }

  const currency = data.price_overview.currency;
  const price = `${data.price_overview.final_formatted} [${currency}]`;
  if (data.price_overview.discount_percent > 0) {
    return `${price} (${data.price_overview.discount_percent}% off, was ${data.price_overview.initial_formatted} [${currency}])`;
  }

  return price;
}

function formatRegionLine(result: RegionResult): string {
  switch (result.kind) {
    case "ok":
      return `- ${result.country}: ${formatRegionPrice(result.data)}`;
    case "missing":
      return `- ${result.country}: Store page unavailable`;
    case "error":
      return `- ${result.country}: Error retrieving store details (${result.error})`;
  }
}

function collectPaidRegions(results: RegionResult[]): PaidRegion[] {
  return results.flatMap((result) => {
    if (
      result.kind !== "ok" ||
      result.data.is_free ||
      !result.data.price_overview
    ) {
      return [];
    }

    return [
      {
        country: result.country,
        currency: result.data.price_overview.currency,
        final: result.data.price_overview.final,
        formatted: result.data.price_overview.final_formatted,
      },
    ];
  });
}

function buildComparisonNotes(results: RegionResult[]): string[] {
  const notes: string[] = [];
  const paidRegions = collectPaidRegions(results);
  const currencies = [...new Set(paidRegions.map((region) => region.currency))];

  if (currencies.length > 1) {
    notes.push(
      `Multiple currencies detected (${currencies.join(", ")}). Cross-currency deltas are intentionally omitted.`
    );
  }

  for (const currency of currencies) {
    const entries = paidRegions
      .filter((region) => region.currency === currency)
      .sort(
        (left, right) =>
          left.final - right.final ||
          left.country.localeCompare(right.country)
      );

    if (entries.length < 2) {
      continue;
    }

    const cheapest = entries[0];
    const mostExpensive = entries[entries.length - 1];

    if (cheapest.final === mostExpensive.final) {
      notes.push(
        `${currency} regions are tied at ${cheapest.formatted}: ${entries
          .map((entry) => entry.country)
          .join(", ")}.`
      );
      continue;
    }

    if (cheapest.final <= 0) {
      notes.push(
        `${currency} regions: cheapest ${cheapest.country} at ${cheapest.formatted}; highest ${mostExpensive.country} at ${mostExpensive.formatted}. Percentage delta is omitted because the lowest price is 0.`
      );
      continue;
    }

    const spreadPercent =
      ((mostExpensive.final - cheapest.final) / cheapest.final) * 100;
    notes.push(
      `${currency} regions: cheapest ${cheapest.country} at ${cheapest.formatted}; highest ${mostExpensive.country} at ${mostExpensive.formatted} (+${spreadPercent.toFixed(1)}% vs cheapest).`
    );
  }

  const discountedRegions = results.flatMap((result) => {
    if (
      result.kind !== "ok" ||
      !result.data.price_overview ||
      result.data.price_overview.discount_percent === 0
    ) {
      return [];
    }

    return [
      `${result.country} (${result.data.price_overview.discount_percent}% off)`,
    ];
  });
  if (discountedRegions.length > 0) {
    notes.push(`Discounted regions: ${discountedRegions.join(", ")}.`);
  }

  const freeRegions = results.flatMap((result) =>
    result.kind === "ok" && result.data.is_free ? [result.country] : []
  );
  if (freeRegions.length > 0) {
    notes.push(`Free to Play regions: ${freeRegions.join(", ")}.`);
  }

  const unavailablePriceRegions = results.flatMap((result) => {
    if (
      result.kind === "ok" &&
      !result.data.is_free &&
      !result.data.price_overview
    ) {
      return [result.country];
    }

    return [];
  });
  if (unavailablePriceRegions.length > 0) {
    notes.push(
      `Price unavailable in: ${unavailablePriceRegions.join(", ")}.`
    );
  }

  const missingRegions = results.flatMap((result) =>
    result.kind === "missing" ? [result.country] : []
  );
  if (missingRegions.length > 0) {
    notes.push(`Store page unavailable in: ${missingRegions.join(", ")}.`);
  }

  const errorRegions = results.flatMap((result) =>
    result.kind === "error" ? [`${result.country} (${result.error})`] : []
  );
  if (errorRegions.length > 0) {
    notes.push(`Request errors: ${errorRegions.join(", ")}.`);
  }

  if (notes.length === 0) {
    notes.push("No comparable paid pricing was returned for the requested regions.");
  }

  return notes;
}

export function registerCompareRegionalPrices(
  server: McpServer,
  prefix: string
): void {
  server.tool(
    `${prefix}compare-regional-prices`,
    "Compare Steam store pricing across multiple explicit country codes. Shows local prices, discounts, and currency-safe regional comparisons without requiring a Steam API key.",
    {
      appid: z.number().describe("Steam application ID"),
      countries: z
        .array(
          z
            .string()
            .trim()
            .toUpperCase()
            .regex(/^[A-Z]{2}$/)
            .describe("Two-letter country code (for example 'us', 'gb', 'de').")
        )
        .min(2)
        .max(10)
        .describe(
          "List of country codes to compare. Provide 2 to 10 entries."
        ),
      language: z
        .string()
        .optional()
        .describe(
          "Language for store text fields (for example 'english', 'french', 'german')."
        ),
    },
    async ({ appid, countries, language }) => {
      try {
        const normalizedCountries = normalizeCountryCodes(countries);
        if (normalizedCountries.length < 2) {
          return {
            content: [
              {
                type: "text" as const,
                text: "Provide at least two distinct country codes to compare.",
              },
            ],
            isError: true,
          };
        }

        const results = await Promise.all(
          normalizedCountries.map(async (country): Promise<RegionResult> => {
            try {
              const data = await fetchStoreDetails(appid, country, language);
              if (!data) {
                return { country, kind: "missing" };
              }

              return { country, kind: "ok", data };
            } catch (error) {
              const message =
                error instanceof Error ? error.message : String(error);
              return { country, kind: "error", error: message };
            }
          })
        );

        const successfulResults = results.filter(
          (result): result is Extract<RegionResult, { kind: "ok" }> =>
            result.kind === "ok"
        );

        if (successfulResults.length === 0) {
          return {
            content: [
              {
                type: "text" as const,
                text: [
                  `No store data was available for app ${appid} in the requested regions.`,
                  "",
                  "**Regional results:**",
                  ...results.map(formatRegionLine),
                ].join("\n"),
              },
            ],
            isError: true,
          };
        }

        const appName = successfulResults[0].data.name;
        const responseLines = [
          `# ${appName} regional pricing`,
          `**App ID:** ${appid}`,
          `**Compared regions:** ${normalizedCountries.join(", ")}`,
          "",
          "**Regional prices:**",
          ...results.map(formatRegionLine),
          "",
          "**Comparison notes:**",
          ...buildComparisonNotes(results).map((note) => `- ${note}`),
        ];

        return {
          content: [{ type: "text" as const, text: responseLines.join("\n") }],
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          content: [{ type: "text" as const, text: `Error: ${message}` }],
          isError: true,
        };
      }
    }
  );
}
