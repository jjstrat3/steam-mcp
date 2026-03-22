import Fuse from "fuse.js";
import { fetchAppList } from "./steam-api.js";
import type { SteamApp } from "./types.js";

let appList: SteamApp[] = [];
let fuseIndex: Fuse<SteamApp> | null = null;
let lastFetchTime = 0;
let loadingPromise: Promise<void> | null = null;
const REFRESH_INTERVAL = 24 * 60 * 60 * 1000; // 24 hours

async function ensureLoaded(): Promise<void> {
  const now = Date.now();
  if (appList.length > 0 && now - lastFetchTime < REFRESH_INTERVAL) {
    return;
  }

  if (loadingPromise) {
    await loadingPromise;
    return;
  }

  const apiKey = process.env.STEAM_API_KEY;
  if (!apiKey) {
    throw new Error(
      "STEAM_API_KEY environment variable is required for search-apps. " +
        "Get your key at https://steamcommunity.com/dev/apikey"
    );
  }

  loadingPromise = (async () => {
    console.error("Fetching Steam app list...");
    const nextAppList = await fetchAppList(apiKey);
    const nextFuseIndex = new Fuse(nextAppList, {
      keys: ["name"],
      threshold: 0.3,
      distance: 200,
      minMatchCharLength: 2,
    });

    appList = nextAppList;
    fuseIndex = nextFuseIndex;
    lastFetchTime = now;
    console.error(`Loaded ${appList.length} apps into search index.`);
  })();

  try {
    await loadingPromise;
  } finally {
    loadingPromise = null;
  }
}

export interface SearchResult {
  app: SteamApp;
  score: number;
}

export async function searchApps(
  query: string,
  limit: number
): Promise<SearchResult[]> {
  await ensureLoaded();
  if (!fuseIndex) {
    throw new Error("Search index not initialized");
  }

  const results = fuseIndex.search(query, { limit });
  return results.map((r) => ({
    app: r.item,
    score: Math.round((1 - (r.score ?? 0)) * 100) / 100,
  }));
}
