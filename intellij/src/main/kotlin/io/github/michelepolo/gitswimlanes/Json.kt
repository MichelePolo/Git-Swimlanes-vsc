package io.github.michelepolo.gitswimlanes

// Mirror of packages/contract/src/index.ts (canonical source).
// Kept by hand: a JVM host cannot import TypeScript types.

/** Decoded Webview → Host message (only fields used by the host). */
data class WvMessage(
  val type: String,
  val reqId: String? = null,
  val hash: String? = null,
  val path: String? = null,
  val oldPath: String? = null,
)

object Json {
  // TODO (intellij spec §3): decode(request) / encode(msg) via the platform JSON util.
  fun decode(@Suppress("UNUSED_PARAMETER") request: String): WvMessage =
    throw NotImplementedError("Json.decode — see git-swimlanes-intellij-spec.md §3")

  fun encode(@Suppress("UNUSED_PARAMETER") msg: Any): String =
    throw NotImplementedError("Json.encode — see git-swimlanes-intellij-spec.md §3")
}
