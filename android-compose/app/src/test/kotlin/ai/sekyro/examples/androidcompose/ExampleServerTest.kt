package ai.sekyro.examples.androidcompose

import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test

class ExampleServerTest {
    private class FakeTransport(private val code: Int, private val body: String) : Transport {
        val calls = mutableListOf<Triple<String, String, String?>>()
        override fun send(method: String, url: String, body: String?): Pair<Int, String> {
            calls += Triple(method, url, body)
            return code to this.body
        }
    }

    @Test
    fun `posts the locale and parses the created session`() = runTest {
        val fake = FakeTransport(200, """{"sessionId":"s1","clientToken":"t1","expiresAt":"2030-01-01T00:00:00Z"}""")
        val created = ExampleServer("http://server.test/", fake).createSession(locale = "fr")
        assertEquals("s1", created.sessionId)
        assertEquals("t1", created.clientToken)
        assertEquals(Triple("POST", "http://server.test/sessions", """{"locale":"fr"}"""), fake.calls.single())
    }

    @Test
    fun `keeps the verdict fields and ignores the rest`() = runTest {
        val fake = FakeTransport(200, """{"sessionId":"s1","status":"not_verified","reason":"rejected","closedBy":"system","extra":1}""")
        val view = ExampleServer("http://server.test", fake).getSession("s1")
        assertEquals(SessionView("s1", "not_verified", reason = "rejected", closedBy = "system"), view)
        assertNull(view.personId)
        assertTrue(view.isTerminal)
        assertFalse(SessionView("s1", "in_progress").isTerminal)
    }

    @Test
    fun `refuses a created session without a client token`() {
        val fake = FakeTransport(200, """{"sessionId":"s1","expiresAt":"x"}""")
        assertThrows(ExampleServerException::class.java) { kotlinx.coroutines.runBlocking { ExampleServer("http://server.test", fake).createSession() } }
    }

    @Test
    fun `fails on an error status`() {
        val fake = FakeTransport(403, "{}")
        val e = assertThrows(ExampleServerException::class.java) { kotlinx.coroutines.runBlocking { ExampleServer("http://server.test", fake).getSession("s1") } }
        assertEquals("GET /sessions/s1 answered 403", e.message)
    }

    @Test
    fun `the client token never reaches toString`() {
        assertFalse(CreatedSession("s1", "t1", "x").toString().contains("t1"))
    }
}
