/** Kind of a unified-diff line, for rendering. See engine spec §5.3. */
export type DiffLineKind = "hunk" | "meta" | "add" | "del" | "ctx";

/**
 * Classify one line of a unified diff for coloring.
 *
 * Order matters: file headers ("+++"/"---") and other git metadata must be matched
 * before the bare "+"/"-" content checks, since they share the same first character.
 */
export function classifyDiffLine(l: string): DiffLineKind {
  if (l.startsWith("@@")) return "hunk";
  if (/^(\+\+\+|---|diff |index |new file|deleted file|similarity|rename )/.test(l)) return "meta";
  if (l.startsWith("+")) return "add";
  if (l.startsWith("-")) return "del";
  return "ctx";
}
