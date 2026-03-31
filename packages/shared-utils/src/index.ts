// Shared utils — placeholder
export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

import { MAP_LAYOUT, MAP_WIDTH, MAP_HEIGHT } from '@ao/shared-constants';

/**
 * Returns true if the given tile coordinate is a solid (impassable) tile.
 * Uses Math.round so the check matches where the sprite center is visually rendered.
 */
export function isSolid(tileX: number, tileY: number): boolean {
  const x = Math.round(tileX);
  const y = Math.round(tileY);
  if (x < 0 || x >= MAP_WIDTH || y < 0 || y >= MAP_HEIGHT) return true;
  return MAP_LAYOUT[y][x] === 1;
}
