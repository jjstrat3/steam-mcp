import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { SteamApp } from './types.js';

// Mock the steam-api module
vi.mock('./steam-api.js', () => ({
  fetchAppList: vi.fn(),
}));

describe('cache', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.resetAllMocks();
    delete process.env.STEAM_API_KEY;
  });

  afterEach(() => {
    vi.clearAllTimers();
  });

  describe('searchApps', () => {
    it('should throw error when STEAM_API_KEY is not set', async () => {
      const { searchApps } = await import('./cache.js');

      await expect(searchApps('dota', 5)).rejects.toThrow(
        'STEAM_API_KEY environment variable is required'
      );
    });

    it('should load app list and return search results', async () => {
      process.env.STEAM_API_KEY = 'test-key';

      const mockApps: SteamApp[] = [
        { appid: 570, name: 'Dota 2' },
        { appid: 730, name: 'Counter-Strike 2' },
        { appid: 440, name: 'Team Fortress 2' },
      ];

      const { fetchAppList } = await import('./steam-api.js');
      vi.mocked(fetchAppList).mockResolvedValueOnce(mockApps);

      const { searchApps } = await import('./cache.js');
      const results = await searchApps('dota', 5);

      expect(results.length).toBeGreaterThan(0);
      expect(results[0].app.appid).toBe(570);
      expect(results[0].app.name).toBe('Dota 2');
      expect(results[0].score).toBeGreaterThan(0);
      expect(results[0].score).toBeLessThanOrEqual(1);
    });

    it('should respect limit parameter', async () => {
      process.env.STEAM_API_KEY = 'test-key';

      const mockApps: SteamApp[] = [
        { appid: 570, name: 'Dota 2' },
        { appid: 730, name: 'Counter-Strike 2' },
        { appid: 440, name: 'Team Fortress 2' },
        { appid: 550, name: 'Left 4 Dead 2' },
      ];

      const { fetchAppList } = await import('./steam-api.js');
      vi.mocked(fetchAppList).mockResolvedValueOnce(mockApps);

      const { searchApps } = await import('./cache.js');
      const results = await searchApps('2', 2);

      expect(results.length).toBeLessThanOrEqual(2);
    });

    it('should return fuzzy matches', async () => {
      process.env.STEAM_API_KEY = 'test-key';

      const mockApps: SteamApp[] = [
        { appid: 570, name: 'Dota 2' },
        { appid: 730, name: 'Counter-Strike 2' },
      ];

      const { fetchAppList } = await import('./steam-api.js');
      vi.mocked(fetchAppList).mockResolvedValueOnce(mockApps);

      const { searchApps } = await import('./cache.js');
      const results = await searchApps('dota', 5); // Partial match

      expect(results.length).toBeGreaterThan(0);
      expect(results[0].app.name).toContain('Dota');
    });
  });
});
