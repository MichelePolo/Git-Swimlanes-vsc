export const LAYOUT = {
  LP: 16,      // graph left padding
  laneW: 28,   // column width
  RP: 10,      // right padding
  rowH: 46,    // commit row height
  dotR: 6,     // normal node radius
  mergeR: 7.5, // merge node radius
} as const;

export const laneX = (i: number): number =>
  LAYOUT.LP + i * LAYOUT.laneW + LAYOUT.laneW / 2;
