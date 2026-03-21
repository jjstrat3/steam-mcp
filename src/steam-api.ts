import type {
  SteamApp,
  StoreAppListResponse,
  StoreData,
  StoreDetailsResponse,
  OwnedGame,
  OwnedGamesResponse,
  RecentGame,
  RecentGamesResponse,
  PlayerSummary,
  PlayerSummariesResponse,
  Friend,
  FriendListResponse,
  PlayerAchievement,
  PlayerAchievementsResponse,
  GlobalAchievementPercentage,
  GlobalAchievementPercentagesResponse,
  CurrentPlayersResponse,
  NewsItem,
  NewsResponse,
} from "./types.js";

// --- Fetch with timeout and bounded retry ---

const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_MAX_RETRIES = 2;
const DEFAULT_INITIAL_DELAY_MS = 1_000;
const MAX_RETRY_AFTER_MS = 30_000;
const JITTER_MAX_MS = 500;

export interface FetchWithRetryOptions {
  timeoutMs?: number;
  maxRetries?: number;
  initialDelayMs?: number;
}

function isRetryableStatus(status: number): boolean {
  return status === 429 || (status >= 500 && status <= 599);
}

function calculateDelay(attempt: number, initialDelayMs: number): number {
  const exponential = initialDelayMs * Math.pow(2, attempt);
  const jitter = Math.random() * JITTER_MAX_MS;
  return exponential + jitter;
}

function getRetryAfterMs(res: Response): number | null {
  const header = res.headers?.get?.("Retry-After");
  if (!header) return null;
  const seconds = Number(header);
  if (isNaN(seconds) || seconds <= 0) return null;
  return Math.min(seconds * 1000, MAX_RETRY_AFTER_MS);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function fetchWithRetry(
  url: string | URL,
  init?: RequestInit,
  options?: FetchWithRetryOptions,
): Promise<Response> {
  const {
    timeoutMs = DEFAULT_TIMEOUT_MS,
    maxRetries = DEFAULT_MAX_RETRIES,
    initialDelayMs = DEFAULT_INITIAL_DELAY_MS,
  } = options ?? {};

  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(
      () =>
        controller.abort(
          new DOMException(
            `Request timed out after ${timeoutMs}ms`,
            "TimeoutError",
          ),
        ),
      timeoutMs,
    );
    const signal = init?.signal
      ? AbortSignal.any([init.signal, controller.signal])
      : controller.signal;

    try {
      const res = await fetch(url, {
        ...init,
        signal,
      });

      if (isRetryableStatus(res.status) && attempt < maxRetries) {
        const retryAfter =
          res.status === 429 ? getRetryAfterMs(res) : null;
        const delay =
          retryAfter ?? calculateDelay(attempt, initialDelayMs);
        lastError = new Error(`HTTP ${res.status}`);
        res.body?.cancel().catch(() => {});
        await sleep(delay);
        continue;
      }

      return res;
    } catch (error) {
      const isTimeout =
        error instanceof DOMException && error.name === "TimeoutError";
      const isNetworkError = error instanceof TypeError;

      if ((isTimeout || isNetworkError) && attempt < maxRetries) {
        lastError = isTimeout
          ? new Error(`Request timed out after ${timeoutMs}ms`)
          : (error as Error);
        await sleep(calculateDelay(attempt, initialDelayMs));
        continue;
      }

      if (isTimeout) {
        throw new Error(`Request timed out after ${timeoutMs}ms`);
      }

      if (isNetworkError) {
        lastError = error;
        break;
      }

      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  throw new Error(
    `Failed after ${maxRetries + 1} attempts: ${lastError?.message ?? "Unknown error"}`,
  );
}

// --- Steam API fetch functions ---

export async function fetchAppList(apiKey: string): Promise<SteamApp[]> {
  const allApps: SteamApp[] = [];
  let lastAppId = 0;

  while (true) {
    const params = new URLSearchParams({
      key: apiKey,
      max_results: "50000",
      include_games: "true",
      include_dlc: "true",
      include_software: "true",
      include_videos: "true",
      include_hardware: "true",
    });
    if (lastAppId > 0) {
      params.set("last_appid", String(lastAppId));
    }

    const res = await fetchWithRetry(
      `https://api.steampowered.com/IStoreService/GetAppList/v1/?${params}`
    );
    if (!res.ok) {
      throw new Error(`Failed to fetch app list: HTTP ${res.status}`);
    }

    const data = (await res.json()) as StoreAppListResponse;
    const apps = data.response.apps ?? [];

    if (apps.length === 0) {
      break;
    }

    allApps.push(...apps);
    lastAppId = data.response.last_appid ?? apps[apps.length - 1].appid;

    if (!data.response.have_more_results) {
      break;
    }
  }

  return allApps.filter((app) => app.name.trim() !== "");
}

export async function fetchStoreDetails(
  appId: number,
  cc?: string,
  language?: string
): Promise<StoreData | null> {
  const params = new URLSearchParams({ appids: String(appId) });
  if (cc) params.set("cc", cc);
  if (language) params.set("l", language);

  const res = await fetchWithRetry(
    `https://store.steampowered.com/api/appdetails/?${params}`
  );
  if (!res.ok) {
    throw new Error(`Failed to fetch store details: HTTP ${res.status}`);
  }
  const data = (await res.json()) as StoreDetailsResponse;
  const entry = data[String(appId)];
  if (!entry || !entry.success || !entry.data) {
    return null;
  }
  return entry.data;
}

export async function fetchOwnedGames(
  apiKey: string,
  steamId: string
): Promise<OwnedGame[]> {
  const params = new URLSearchParams({
    key: apiKey,
    steamid: steamId,
    include_appinfo: "1",
    include_played_free_games: "1",
    format: "json",
  });

  const res = await fetchWithRetry(
    `https://api.steampowered.com/IPlayerService/GetOwnedGames/v0001/?${params}`
  );
  if (!res.ok) {
    throw new Error(`Failed to fetch owned games: HTTP ${res.status}`);
  }
  const data = (await res.json()) as OwnedGamesResponse;
  return data.response.games ?? [];
}

export async function fetchRecentGames(
  apiKey: string,
  steamId: string
): Promise<RecentGame[]> {
  const params = new URLSearchParams({
    key: apiKey,
    steamid: steamId,
    format: "json",
  });

  const res = await fetchWithRetry(
    `https://api.steampowered.com/IPlayerService/GetRecentlyPlayedGames/v0001/?${params}`
  );
  if (!res.ok) {
    throw new Error(`Failed to fetch recent games: HTTP ${res.status}`);
  }
  const data = (await res.json()) as RecentGamesResponse;
  return data.response.games ?? [];
}

export async function fetchPlayerSummaries(
  apiKey: string,
  steamIds: string[]
): Promise<PlayerSummary[]> {
  const params = new URLSearchParams({
    key: apiKey,
    steamids: steamIds.join(","),
    format: "json",
  });

  const res = await fetchWithRetry(
    `https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v0002/?${params}`
  );
  if (!res.ok) {
    throw new Error(`Failed to fetch player summaries: HTTP ${res.status}`);
  }
  const data = (await res.json()) as PlayerSummariesResponse;
  return data.response.players ?? [];
}

export async function fetchFriendList(
  apiKey: string,
  steamId: string,
  relationship?: string
): Promise<Friend[]> {
  const params = new URLSearchParams({
    key: apiKey,
    steamid: steamId,
    relationship: relationship ?? "friend",
    format: "json",
  });

  const res = await fetchWithRetry(
    `https://api.steampowered.com/ISteamUser/GetFriendList/v0001/?${params}`
  );
  if (!res.ok) {
    if (res.status === 401) {
      throw new Error(
        "This user's friend list is not public. Friend lists are only visible for profiles with public visibility."
      );
    }
    throw new Error(`Failed to fetch friend list: HTTP ${res.status}`);
  }
  const data = (await res.json()) as FriendListResponse;
  return data.friendslist?.friends ?? [];
}

export async function fetchPlayerAchievements(
  apiKey: string,
  steamId: string,
  appId: number,
  language?: string
): Promise<PlayerAchievement[]> {
  const params = new URLSearchParams({
    key: apiKey,
    steamid: steamId,
    appid: String(appId),
    format: "json",
  });
  if (language) params.set("l", language);

  const res = await fetchWithRetry(
    `https://api.steampowered.com/ISteamUserStats/GetPlayerAchievements/v0001/?${params}`
  );
  if (!res.ok) {
    throw new Error(`Failed to fetch player achievements: HTTP ${res.status}`);
  }
  const data = (await res.json()) as PlayerAchievementsResponse;
  if (!data.playerstats?.success) {
    throw new Error(
      "Could not retrieve achievements. The game may have no achievements, or the user's profile may be private."
    );
  }
  return data.playerstats.achievements ?? [];
}

export async function fetchGlobalAchievementPercentages(
  appId: number
): Promise<GlobalAchievementPercentage[]> {
  const params = new URLSearchParams({
    gameid: String(appId),
    format: "json",
  });

  const res = await fetchWithRetry(
    `https://api.steampowered.com/ISteamUserStats/GetGlobalAchievementPercentagesForApp/v0002/?${params}`
  );
  if (!res.ok) {
    throw new Error(
      `Failed to fetch global achievement percentages: HTTP ${res.status}`
    );
  }
  const data = (await res.json()) as GlobalAchievementPercentagesResponse;
  return data.achievementpercentages?.achievements ?? [];
}

export async function fetchCurrentPlayers(
  appId: number
): Promise<number> {
  const params = new URLSearchParams({
    appid: String(appId),
    format: "json",
  });

  const res = await fetchWithRetry(
    `https://api.steampowered.com/ISteamUserStats/GetNumberOfCurrentPlayers/v0001/?${params}`
  );
  if (!res.ok) {
    throw new Error(`Failed to fetch current players: HTTP ${res.status}`);
  }
  const data = (await res.json()) as CurrentPlayersResponse;
  return data.response.player_count;
}

export async function fetchNews(
  appId: number,
  count?: number,
  maxlength?: number
): Promise<NewsItem[]> {
  const params = new URLSearchParams({
    appid: String(appId),
    count: String(count ?? 5),
    maxlength: String(maxlength ?? 500),
    format: "json",
  });

  const res = await fetchWithRetry(
    `https://api.steampowered.com/ISteamNews/GetNewsForApp/v0002/?${params}`
  );
  if (!res.ok) {
    throw new Error(`Failed to fetch news: HTTP ${res.status}`);
  }
  const data = (await res.json()) as NewsResponse;
  return data.appnews?.newsitems ?? [];
}
