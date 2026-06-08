package io.github.michelepolo.gitswimlanes

/**
 * Build the self-contained HTML document that JCEF loads via [JBCefBrowser.loadHTML], with
 * the engine bundle inlined (loadHTML resolves no relative paths, so the bundle cannot be a
 * separate `<script src>` the way the VS Code webview loads it).
 *
 * The bundle must have its `</script>` sequences neutralized first — see [escapeInlineScript].
 */
internal fun buildEngineHtml(css: String, js: String): String =
  """
  <!DOCTYPE html>
  <html lang="it"><head><meta charset="utf-8"><style>$css</style></head>
  <body><div id="app"></div><script>${escapeInlineScript(js)}</script></body></html>
  """.trimIndent()

/**
 * Neutralize any `</script>` sequence inside a bundle before it is inlined into a
 * `<script>…</script>` block.
 *
 * react-dom ships the string literal `"<script></script>"`; inlined verbatim, the HTML
 * tokenizer closes our inline script at that inner `</script>` and renders the rest of the
 * bundle as page text (so the graph never mounts). `<\/script` is byte-for-byte equivalent
 * inside a JS string or regex (`\/` is just `/`) but invisible to the HTML parser. The
 * host↔webview messages are base64-encoded for the same class of reason — see
 * [SwimlanesPanel.postToWebview].
 */
internal fun escapeInlineScript(js: String): String =
  js.replace("</script", "<\\/script", ignoreCase = true)
