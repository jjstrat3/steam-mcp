import { beforeEach, describe, expect, it, vi } from "vitest";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { StoreData } from "../types.js";

vi.mock("../steam-api.js", () => ({
  fetchStoreDetails: vi.fn(),
}));

import { fetchStoreDetails } from "../steam-api.js";
import { registerCompareRegionalPrices } from "./compare-regional-prices.js";

interface ToolResponse {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
}

function createStoreData(
  appid: number,
  name: string,
  overrides: Partial<StoreData> = {}
): StoreData {
  return {
    type: "game",
    name,
    steam_appid: appid,
    required_age: 0,
    is_free: false,
    detailed_description: "",
    about_the_game: "",
    short_description: "",
    header_image: "",
    website: null,
    platforms: {
      windows: true,
      mac: false,
      linux: false,
    },
    ...overrides,
  };
}

function getHandler(): (args: {
  appid: number;
  countries: string[];
  language?: string;
}) => Promise<ToolResponse> {
  const tool = vi.fn();
  const server = { tool } as unknown as McpServer;
  registerCompareRegionalPrices(server, "");
  return tool.mock.calls[0][3] as (args: {
    appid: number;
    countries: string[];
    language?: string;
  }) => Promise<ToolResponse>;
}

describe("compare-regional-prices tool", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("compares requested regions with currency-safe output", async () => {
    vi.mocked(fetchStoreDetails).mockImplementation(
      async (_appid, cc, language) => {
        expect(language).toBe("english");

        switch (cc) {
          case "US":
            return createStoreData(620, "Portal 2", {
              price_overview: {
                currency: "USD",
                initial: 1999,
                final: 1999,
                discount_percent: 0,
                initial_formatted: "$19.99",
                final_formatted: "$19.99",
              },
            });
          case "CA":
            return createStoreData(620, "Portal 2", {
              price_overview: {
                currency: "USD",
                initial: 2499,
                final: 2499,
                discount_percent: 0,
                initial_formatted: "$24.99",
                final_formatted: "$24.99",
              },
            });
          case "GB":
            return createStoreData(620, "Portal 2", {
              price_overview: {
                currency: "GBP",
                initial: 2299,
                final: 1799,
                discount_percent: 22,
                initial_formatted: "GBP 22.99",
                final_formatted: "GBP 17.99",
              },
            });
          default:
            throw new Error(`Unexpected country code ${cc}`);
        }
      }
    );

    const handler = getHandler();
    const result = await handler({
      appid: 620,
      countries: ["us", " ca ", "gb", "US"],
      language: "english",
    });

    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toContain("# Portal 2 regional pricing");
    expect(result.content[0].text).toContain("**Compared regions:** US, CA, GB");
    expect(result.content[0].text).toContain("- US: $19.99 [USD]");
    expect(result.content[0].text).toContain("- CA: $24.99 [USD]");
    expect(result.content[0].text).toContain(
      "- GB: GBP 17.99 [GBP] (22% off, was GBP 22.99)"
    );
    expect(result.content[0].text).toContain(
      "Multiple currencies detected (USD, GBP). Cross-currency deltas are intentionally omitted."
    );
    expect(result.content[0].text).toContain(
      "USD regions: cheapest US at $19.99; highest CA at $24.99 (+25.0% vs cheapest)."
    );
    expect(result.content[0].text).toContain("Discounted regions: GB (22% off).");
    expect(
      vi.mocked(fetchStoreDetails).mock.calls.map((call) => call[1])
    ).toEqual(["US", "CA", "GB"]);
  });

  it("keeps partial missing pricing readable instead of failing the whole comparison", async () => {
    vi.mocked(fetchStoreDetails).mockImplementation(async (_appid, cc) => {
      switch (cc) {
        case "US":
          return createStoreData(620, "Portal 2", {
            price_overview: {
              currency: "USD",
              initial: 999,
              final: 999,
              discount_percent: 0,
              initial_formatted: "$9.99",
              final_formatted: "$9.99",
            },
          });
        case "BR":
          return createStoreData(620, "Portal 2");
        case "DE":
          return null;
        default:
          throw new Error(`Unexpected country code ${cc}`);
      }
    });

    const handler = getHandler();
    const result = await handler({
      appid: 620,
      countries: ["us", "br", "de"],
    });

    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toContain("- US: $9.99 [USD]");
    expect(result.content[0].text).toContain("- BR: Price not available");
    expect(result.content[0].text).toContain("- DE: Store page unavailable");
    expect(result.content[0].text).toContain("Price unavailable in: BR.");
    expect(result.content[0].text).toContain(
      "Store page unavailable in: DE."
    );
  });
});
