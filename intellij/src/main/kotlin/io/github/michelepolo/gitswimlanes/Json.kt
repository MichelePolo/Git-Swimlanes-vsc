package io.github.michelepolo.gitswimlanes

import com.google.gson.Gson

// Mirror of packages/contract/src/index.ts (canonical source).
// Kept by hand: a JVM host cannot import TypeScript types.

/** Decoded Webview → Host message (only fields used by the host). */
data class WvMessage(
  val type: String,
  val reqId: String? = null,
  val hash: String? = null,
  val path: String? = null,
  val oldPath: String? = null,
  val id: String? = null,
)

object Json {
  private val gson = Gson()

  /** Parse a Webview → Host message. Unknown fields are ignored. */
  fun decode(request: String): WvMessage = gson.fromJson(request, WvMessage::class.java)

  /** Serialize a Host → Webview message (a map or data object) to JSON. */
  fun encode(msg: Any): String = gson.toJson(msg)
}
