package io.github.michelepolo.gitswimlanes

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class InlineHtmlTest {
  @Test
  fun inlinedBundleDoesNotCloseTheScriptTagEarly() {
    // The exact shape react-dom ships: a string literal that contains a full <script></script>.
    val bundle = """nextResource.innerHTML = "<script></script>";"""
    val html = buildEngineHtml(css = "", js = bundle)

    // Isolate what lives between our opening <script> and the real closing </script>.
    val inlined = html.substringAfter("<script>").substringBeforeLast("</script>")

    // No HTML-visible closing tag may survive inside the inlined bundle, or the parser would
    // close the script early and dump the rest of the bundle as page text.
    assertFalse(
      "inlined bundle must not contain a raw </script",
      inlined.contains("</script", ignoreCase = true),
    )
    // The neutralized form is equivalent JS (\/ is just / inside the string literal).
    assertTrue(inlined.contains("<\\/script"))
  }

  @Test
  fun ordinaryBundleIsInlinedUnchanged() {
    val js = "const x = 1; function f(){ return x }"
    assertEquals(js, escapeInlineScript(js))
  }
}
