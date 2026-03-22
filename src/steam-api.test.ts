import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  fetchAppList,
  fetchPlayerAchievements,
  fetchStoreDetails,
  fetchCurrentPlayers,
  fetchNews,
  fetchOwnedGames,
  fetchWithRetry,
  PlayerAchievementsUnavailableError,
} from './steam-api.js';

// Mock fetch globally
global.fetch = vi.fn();

describe('steam-api', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe('fetchStoreDetails', () => {
    it('should return store data for valid app', async () => {
      const mockResponse = {
        '570': {
          success: true,
          data: {
            type: 'game',
            name: 'Dota 2',
            steam_appid: 570,
            is_free: true,
          },
        },
      };

      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const result = await fetchStoreDetails(570);

      expect(result).toEqual(mockResponse['570'].data);
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('store.steampowered.com/api/appdetails'),
        expect.objectContaining({ signal: expect.any(Object) }),
      );
    });

    it('should return null for unsuccessful response', async () => {
      const mockResponse = {
        '999999': {
          success: false,
        },
      };

      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const result = await fetchStoreDetails(999999);

      expect(result).toBeNull();
    });

    it('should throw on HTTP error', async () => {
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: false,
        status: 400,
      });

      await expect(fetchStoreDetails(570)).rejects.toThrow(
        'Failed to fetch store details: HTTP 400'
      );
    });

    it('should include country code and language params when provided', async () => {
      const mockResponse = {
        '570': {
          success: true,
          data: { name: 'Dota 2' },
        },
      };

      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      await fetchStoreDetails(570, 'US', 'en');

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('cc=US'),
        expect.objectContaining({ signal: expect.any(Object) }),
      );
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('l=en'),
        expect.objectContaining({ signal: expect.any(Object) }),
      );
    });
  });

  describe('fetchCurrentPlayers', () => {
    it('should return player count', async () => {
      const mockResponse = {
        response: {
          player_count: 42000,
          result: 1,
        },
      };

      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const result = await fetchCurrentPlayers(570);

      expect(result).toBe(42000);
    });

    it('should throw on HTTP error', async () => {
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: false,
        status: 404,
      });

      await expect(fetchCurrentPlayers(570)).rejects.toThrow(
        'Failed to fetch current players: HTTP 404'
      );
    });
  });

  describe('fetchNews', () => {
    it('should return news items', async () => {
      const mockResponse = {
        appnews: {
          appid: 570,
          newsitems: [
            {
              gid: '123',
              title: 'Patch Notes',
              url: 'https://example.com',
              author: 'Valve',
              contents: 'New update!',
              feedlabel: 'Product Update',
              date: 1609459200,
            },
          ],
        },
      };

      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const result = await fetchNews(570);

      expect(result).toEqual(mockResponse.appnews.newsitems);
    });

    it('should return empty array when no news available', async () => {
      const mockResponse = {
        appnews: {
          appid: 570,
        },
      };

      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const result = await fetchNews(570);

      expect(result).toEqual([]);
    });

    it('should include count and maxlength params when provided', async () => {
      const mockResponse = {
        appnews: { appid: 570, newsitems: [] },
      };

      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      await fetchNews(570, 10, 1000);

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('count=10'),
        expect.objectContaining({ signal: expect.any(Object) }),
      );
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('maxlength=1000'),
        expect.objectContaining({ signal: expect.any(Object) }),
      );
    });
  });

  describe('fetchOwnedGames', () => {
    it('should return owned games list', async () => {
      const mockResponse = {
        response: {
          game_count: 2,
          games: [
            {
              appid: 570,
              name: 'Dota 2',
              playtime_forever: 1000,
            },
            {
              appid: 730,
              name: 'Counter-Strike 2',
              playtime_forever: 500,
            },
          ],
        },
      };

      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const result = await fetchOwnedGames('test-key', '12345');

      expect(result).toEqual(mockResponse.response.games);
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('GetOwnedGames'),
        expect.objectContaining({ signal: expect.any(Object) }),
      );
    });

    it('should return empty array when user has no games', async () => {
      const mockResponse = {
        response: {
          game_count: 0,
        },
      };

      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const result = await fetchOwnedGames('test-key', '12345');

      expect(result).toEqual([]);
    });

    it('should throw on HTTP error', async () => {
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: false,
        status: 403,
      });

      await expect(fetchOwnedGames('test-key', '12345')).rejects.toThrow(
        'Failed to fetch owned games: HTTP 403'
      );
    });
  });

  describe('fetchPlayerAchievements', () => {
    it('should return achievements when Steam reports success', async () => {
      const mockResponse = {
        playerstats: {
          steamID: '12345',
          gameName: 'Dota 2',
          success: true,
          achievements: [
            {
              apiname: 'FIRST_WIN',
              achieved: 1,
              unlocktime: 1700000000,
            },
          ],
        },
      };

      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const result = await fetchPlayerAchievements('test-key', '12345', 570);

      expect(result).toEqual(mockResponse.playerstats.achievements);
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('GetPlayerAchievements'),
        expect.objectContaining({ signal: expect.any(Object) }),
      );
    });

    it('should throw a typed error when Steam does not provide achievement data', async () => {
      const mockResponse = {
        playerstats: {
          steamID: '12345',
          gameName: 'Dota 2',
          success: false,
        },
      };

      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      let thrown: unknown;
      try {
        await fetchPlayerAchievements('test-key', '12345', 570);
      } catch (error) {
        thrown = error;
      }

      expect(thrown).toBeInstanceOf(PlayerAchievementsUnavailableError);
      expect(thrown).toHaveProperty(
        'message',
        "Could not retrieve achievements. The game may have no achievements, or the user's profile may be private."
      );
    });
  });

  describe('fetchAppList', () => {
    function mockPage(apps: { appid: number; name: string }[], haveMore: boolean, lastAppId?: number) {
      return {
        ok: true,
        json: async () => ({
          response: {
            apps,
            have_more_results: haveMore,
            last_appid: lastAppId ?? (apps.length > 0 ? apps[apps.length - 1].appid : 0),
          },
        }),
      };
    }

    it('should collect apps across multiple pages', async () => {
      (global.fetch as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(mockPage([{ appid: 1, name: 'Game A' }, { appid: 2, name: 'Game B' }], true, 2))
        .mockResolvedValueOnce(mockPage([{ appid: 3, name: 'Game C' }], false, 3));

      const result = await fetchAppList('test-key');
      expect(result).toEqual([
        { appid: 1, name: 'Game A' },
        { appid: 2, name: 'Game B' },
        { appid: 3, name: 'Game C' },
      ]);
      expect(global.fetch).toHaveBeenCalledTimes(2);
    });

    it('should filter out apps with empty names', async () => {
      (global.fetch as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(mockPage([
          { appid: 1, name: 'Game A' },
          { appid: 2, name: '' },
          { appid: 3, name: '   ' },
        ], false, 3));

      const result = await fetchAppList('test-key');
      expect(result).toEqual([{ appid: 1, name: 'Game A' }]);
    });

    it('should stop on empty page', async () => {
      (global.fetch as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(mockPage([{ appid: 1, name: 'Game A' }], true, 1))
        .mockResolvedValueOnce(mockPage([], false));

      const result = await fetchAppList('test-key');
      expect(result).toEqual([{ appid: 1, name: 'Game A' }]);
      expect(global.fetch).toHaveBeenCalledTimes(2);
    });

    it('should throw when last_appid does not advance', async () => {
      (global.fetch as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(mockPage([{ appid: 5, name: 'Game A' }], true, 5))
        .mockResolvedValueOnce(mockPage([{ appid: 5, name: 'Game A' }], true, 5));

      await expect(fetchAppList('test-key')).rejects.toThrow(
        /pagination stuck.*last_appid did not advance/i
      );
    });

    it('should throw when last_appid goes backwards', async () => {
      (global.fetch as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(mockPage([{ appid: 10, name: 'Game A' }], true, 10))
        .mockResolvedValueOnce(mockPage([{ appid: 5, name: 'Game B' }], true, 5));

      await expect(fetchAppList('test-key')).rejects.toThrow(
        /pagination stuck.*last_appid did not advance/i
      );
    });

    it('should stop after max page iterations and log warning', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      try {
        // Internal cap is 20 pages — mock exactly that many
        const maxPages = 20;
        for (let i = 0; i < maxPages; i++) {
          const appid = (i + 1) * 1000;
          (global.fetch as ReturnType<typeof vi.fn>)
            .mockResolvedValueOnce(mockPage([{ appid, name: `Game ${i}` }], true, appid));
        }

        const result = await fetchAppList('test-key');
        expect(result).toHaveLength(maxPages);
        expect(global.fetch).toHaveBeenCalledTimes(maxPages);
        expect(consoleErrorSpy).toHaveBeenCalledWith(
          expect.stringContaining('pagination stopped')
        );
      } finally {
        consoleErrorSpy.mockRestore();
      }
    });

    it('should throw on HTTP error', async () => {
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: false,
        status: 403,
      });

      await expect(fetchAppList('test-key')).rejects.toThrow(
        'Failed to fetch app list: HTTP 403'
      );
    });

    it('should return empty array when first page returns no apps', async () => {
      (global.fetch as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(mockPage([], false));

      const result = await fetchAppList('test-key');
      expect(result).toEqual([]);
    });
  });

  describe('fetchWithRetry', () => {
    it('should return response on successful fetch', async () => {
      const mockResponse = { ok: true, status: 200 };
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockResponse);

      const result = await fetchWithRetry('https://example.com', undefined, {
        timeoutMs: 5000,
        maxRetries: 0,
      });

      expect(result).toBe(mockResponse);
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    it('should retry on 5xx and succeed', async () => {
      (global.fetch as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce({ ok: false, status: 503 })
        .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({}) });

      const result = await fetchWithRetry('https://example.com', undefined, {
        initialDelayMs: 1,
        maxRetries: 2,
      });

      expect(result.ok).toBe(true);
      expect(global.fetch).toHaveBeenCalledTimes(2);
    });

    it('should retry on 429 and succeed', async () => {
      (global.fetch as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce({ ok: false, status: 429 })
        .mockResolvedValueOnce({ ok: true, status: 200 });

      const result = await fetchWithRetry('https://example.com', undefined, {
        initialDelayMs: 1,
        maxRetries: 2,
      });

      expect(result.ok).toBe(true);
      expect(global.fetch).toHaveBeenCalledTimes(2);
    });

    it('should not retry on 4xx errors (non-429)', async () => {
      const mockResponse = { ok: false, status: 401 };
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockResponse);

      const result = await fetchWithRetry('https://example.com', undefined, {
        initialDelayMs: 1,
        maxRetries: 2,
      });

      // 401 is returned immediately without retry — caller decides how to handle
      expect(result.status).toBe(401);
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    it('should return final 5xx response after max retries exhausted', async () => {
      (global.fetch as ReturnType<typeof vi.fn>)
        .mockResolvedValue({ ok: false, status: 500 });

      const result = await fetchWithRetry('https://example.com', undefined, {
        initialDelayMs: 1,
        maxRetries: 2,
      });

      // After all retries, the last 500 response is returned to the caller
      expect(result.status).toBe(500);
      expect(global.fetch).toHaveBeenCalledTimes(3);
    });

    it('should retry on network errors (TypeError)', async () => {
      (global.fetch as ReturnType<typeof vi.fn>)
        .mockRejectedValueOnce(new TypeError('fetch failed'))
        .mockResolvedValueOnce({ ok: true, status: 200 });

      const result = await fetchWithRetry('https://example.com', undefined, {
        initialDelayMs: 1,
        maxRetries: 2,
      });

      expect(result.ok).toBe(true);
      expect(global.fetch).toHaveBeenCalledTimes(2);
    });

    it('should throw on network error after max retries', async () => {
      (global.fetch as ReturnType<typeof vi.fn>)
        .mockRejectedValue(new TypeError('fetch failed'));

      await expect(
        fetchWithRetry('https://example.com', undefined, {
          initialDelayMs: 1,
          maxRetries: 1,
        }),
      ).rejects.toThrow('Failed after 2 attempts');
    });

    it('should timeout on slow requests', async () => {
      (global.fetch as ReturnType<typeof vi.fn>).mockImplementation(
        (_url: unknown, init?: RequestInit) =>
          new Promise((_resolve, reject) => {
            const signal = init?.signal;
            if (signal) {
              signal.addEventListener('abort', () => {
                reject(signal.reason);
              });
            }
          }),
      );

      await expect(
        fetchWithRetry('https://example.com', undefined, {
          timeoutMs: 50,
          maxRetries: 0,
        }),
      ).rejects.toThrow(/timed out/);
    }, 10_000);

    it('should retry on timeout then succeed', async () => {
      // First call times out, second succeeds
      (global.fetch as ReturnType<typeof vi.fn>)
        .mockImplementationOnce(
          (_url: unknown, init?: RequestInit) =>
            new Promise((_resolve, reject) => {
              const signal = init?.signal;
              if (signal) {
                signal.addEventListener('abort', () => {
                  reject(signal.reason);
                });
              }
            }),
        )
        .mockResolvedValueOnce({ ok: true, status: 200 });

      const result = await fetchWithRetry('https://example.com', undefined, {
        timeoutMs: 50,
        initialDelayMs: 1,
        maxRetries: 1,
      });

      expect(result.ok).toBe(true);
      expect(global.fetch).toHaveBeenCalledTimes(2);
    }, 10_000);

    it('should not retry non-retryable errors', async () => {
      const customError = new Error('some unrecoverable error');
      (global.fetch as ReturnType<typeof vi.fn>).mockRejectedValueOnce(customError);

      await expect(
        fetchWithRetry('https://example.com', undefined, {
          initialDelayMs: 1,
          maxRetries: 2,
        }),
      ).rejects.toThrow('some unrecoverable error');

      expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    it('should respect Retry-After header on 429', async () => {
      vi.useFakeTimers();
      try {
        const headers = new Headers({ 'Retry-After': '1' });
        (global.fetch as ReturnType<typeof vi.fn>)
          .mockResolvedValueOnce({ ok: false, status: 429, headers })
          .mockResolvedValueOnce({ ok: true, status: 200 });

        const retryPromise = fetchWithRetry('https://example.com', undefined, {
          initialDelayMs: 1,
          maxRetries: 1,
        });

        // Retry-After: 1 means 1 second = 1000ms delay
        await vi.advanceTimersByTimeAsync(1000);

        const result = await retryPromise;
        expect(result.ok).toBe(true);
        expect(global.fetch).toHaveBeenCalledTimes(2);
      } finally {
        vi.useRealTimers();
      }
    });
  });
});
