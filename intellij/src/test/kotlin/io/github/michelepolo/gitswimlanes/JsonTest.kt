package io.github.michelepolo.gitswimlanes

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class JsonTest {
  @Test
  fun decodesARequestDiffMessage() {
    val m = Json.decode("""{"type":"requestDiff","reqId":"d1","hash":"abc1234","path":"src/a.ts"}""")
    assertEquals("requestDiff", m.type)
    assertEquals("d1", m.reqId)
    assertEquals("abc1234", m.hash)
    assertEquals("src/a.ts", m.path)
  }

  @Test
  fun decodesAReadyMessageWithOnlyAType() {
    val m = Json.decode("""{"type":"ready"}""")
    assertEquals("ready", m.type)
    assertNull(m.hash)
    assertNull(m.reqId)
  }

  @Test
  fun encodesAHostMessageMap() {
    val s = Json.encode(mapOf("type" to "setLog", "log" to "a|b|c"))
    assertTrue(s.contains("\"type\":\"setLog\""))
    assertTrue(s.contains("\"log\":\"a|b|c\""))
  }

  @Test
  fun encodesADiffResultPreservingNewlines() {
    val s = Json.encode(mapOf("type" to "diffResult", "reqId" to "d1", "unified" to "line1\nline2"))
    // Gson escapes the newline as \n inside the JSON string.
    assertTrue(s.contains("line1\\nline2"))
  }
}
