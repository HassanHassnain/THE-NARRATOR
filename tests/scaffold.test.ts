import { describe, expect, it } from 'vitest';
import config from '../config/narrator.json';

describe('scaffold configuration', () => {
  it('provides six original genre presets with six short examples each', () => {
    expect(Object.keys(config.genres).sort()).toEqual(['epic', 'heist', 'horror', 'nature', 'noir', 'sports']);
    for (const genre of Object.values(config.genres)) {
      expect(genre.persona.length).toBeGreaterThan(0);
      expect(genre.examples).toHaveLength(6);
      expect(genre.voice).toMatch(/^[ab][fm]_/);
      expect(genre.displayStyle.color).toMatch(/^#[a-f0-9]{6}$/i);
      for (const line of genre.examples) expect(line.split(/\s+/).length).toBeLessThanOrEqual(config.limits.lineWords);
    }
    expect(config.twistMode).toBe('approve');
    expect(config.cadence.defaultSeconds).toBe(35);
  });
});
