import type { Theme } from "@michelepolo/git-swimlanes-contract";

export function hueFromName(name: string): number {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h % 360;
}

const DEFAULT_SATURATION = 68;
const DEFAULT_LIGHTNESS = 60;

/**
 * Deterministic branch color: hue is a pure function of the name; saturation/lightness
 * default to dark-tuned values but can be overridden (e.g. lower lightness on light themes).
 * The "(no branch ref)" and "hidden" sentinel lanes are always fixed desaturated grays
 * (theme-independent), and distinct from each other.
 */
export function colorFor(name: string, saturation = DEFAULT_SATURATION, lightness = DEFAULT_LIGHTNESS): string {
  if (name === "(no branch ref)") return "hsl(215 10% 50%)";
  if (name === "hidden") return "hsl(215 8% 42%)";
  return `hsl(${hueFromName(name)} ${saturation}% ${lightness}%)`;
}

/** Bind {@link colorFor} to a theme's lane saturation/lightness (defaults 68/60). */
export function laneColorer(theme?: Partial<Pick<Theme, "laneSaturation" | "laneLightness">>): (name: string) => string {
  const s = theme?.laneSaturation ?? DEFAULT_SATURATION;
  const l = theme?.laneLightness ?? DEFAULT_LIGHTNESS;
  return (name) => colorFor(name, s, l);
}
