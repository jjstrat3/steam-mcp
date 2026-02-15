import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  fetchStoreDetails,
  fetchCurrentPlayers,
  fetchNews,
  fetchOwnedGames,
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
        expect.stringContaining('store.steampowered.com/api/appdetails')
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
        status: 500,
      });

      await expect(fetchStoreDetails(570)).rejects.toThrow(
        'Failed to fetch store details: HTTP 500'
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
        expect.stringContaining('cc=US')
      );
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('l=en')
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
        expect.stringContaining('count=10')
      );
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('maxlength=1000')
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
        expect.stringContaining('GetOwnedGames')
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
});
