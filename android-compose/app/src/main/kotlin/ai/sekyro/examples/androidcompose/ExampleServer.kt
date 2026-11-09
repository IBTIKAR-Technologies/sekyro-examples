package ai.sekyro.examples.androidcompose

import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.Serializable
import kotlinx.serialization.SerializationException
import kotlinx.serialization.json.Json

/** A new session from `POST /sessions`. [clientToken] is a one-time bearer credential: hand it to the SDK, never show or log it. */
@Serializable
data class CreatedSession(val sessionId: String, val clientToken: String, val expiresAt: String) {
    override fun toString() = "CreatedSession(sessionId=$sessionId, expiresAt=$expiresAt)"
}

/**
 * The server's view of a session (`GET /sessions/:id`): `created`, `in_progress`, `review_pending`, `verified` or
 * `not_verified`, with the reason and who closed it once it is final.
 */
@Serializable
data class SessionView(
    val sessionId: String,
    val status: String,
    val reason: String? = null,
    val closedBy: String? = null,
    val personId: String? = null,
) {
    /** True once the server has a final verdict (the session will not change any more). */
    val isTerminal: Boolean get() = status == "verified" || status == "not_verified"

    val summary: String
        get() = listOfNotNull(status, reason, closedBy?.let { "closed by $it" }, personId?.let { "person $it" }).joinToString(" · ")
}

class ExampleServerException(message: String) : Exception(message)

/** Sends one HTTP request and returns the status code and the body. Swapped for a fake in the unit tests. */
fun interface Transport {
    fun send(method: String, url: String, body: String?): Pair<Int, String>
}

/** The plain `HttpURLConnection` transport (blocking: [ExampleServer] calls it on the IO dispatcher). */
object HttpTransport : Transport {
    override fun send(method: String, url: String, body: String?): Pair<Int, String> {
        val conn = URL(url).openConnection() as HttpURLConnection
        try {
            conn.requestMethod = method
            conn.connectTimeout = 10_000
            conn.readTimeout = 15_000
            conn.setRequestProperty("Accept", "application/json")
            if (body != null) {
                conn.doOutput = true
                conn.setRequestProperty("Content-Type", "application/json")
                conn.outputStream.use { it.write(body.toByteArray()) }
            }
            val code = conn.responseCode
            val stream = if (code in 200..299) conn.inputStream else conn.errorStream
            return code to (stream?.bufferedReader()?.use { it.readText() } ?: "")
        } finally {
            conn.disconnect()
        }
    }
}

/** The calls this app makes to examples/node-express. The server holds the API key; the app never sees it. */
class ExampleServer(baseUrl: String, private val transport: Transport = HttpTransport) {
    val baseUrl: String = baseUrl.trimEnd('/')

    suspend fun createSession(locale: String? = null): CreatedSession =
        decode(request("POST", "/sessions", if (locale == null) "{}" else json.encodeToString(mapOf("locale" to locale))))

    suspend fun getSession(id: String): SessionView = decode(request("GET", "/sessions/${escape(id)}"))

    /** A JSON call to the server; FinishWithTestData.kt (debug builds only) uses it for its one route. */
    suspend fun request(method: String, path: String, body: String? = null): String = withContext(Dispatchers.IO) {
        val (code, text) = transport.send(method, baseUrl + path, body)
        if (code !in 200..299) throw ExampleServerException("$method $path answered $code")
        text
    }

    companion object {
        val json = Json { ignoreUnknownKeys = true }

        inline fun <reified T> decode(text: String): T = try {
            json.decodeFromString<T>(text)
        } catch (e: SerializationException) {
            throw ExampleServerException("Unexpected server response: ${e.message}")
        } catch (e: IllegalArgumentException) {
            throw ExampleServerException("Unexpected server response: ${e.message}")
        }

        fun escape(id: String): String = URLEncoder.encode(id, "UTF-8").replace("+", "%20")
    }
}
