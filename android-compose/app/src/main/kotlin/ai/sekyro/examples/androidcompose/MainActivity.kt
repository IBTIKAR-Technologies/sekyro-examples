package ai.sekyro.examples.androidcompose

import ai.sekyro.Sekyro
import ai.sekyro.SekyroConfig
import ai.sekyro.SekyroEvent
import ai.sekyro.SekyroResult
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.lifecycleScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

/**
 * Fetch a client token from examples/node-express, run the Sekyro drop-in, show the step events and the display-only
 * result, then poll the server for the verdict.
 */
class MainActivity : ComponentActivity() {
    private val server = ExampleServer(BuildConfig.EXAMPLE_SERVER_URL)

    private var sessionId by mutableStateOf<String?>(null)
    private val events = mutableStateListOf<String>()
    private var result by mutableStateOf<String?>(null)
    private var verdict by mutableStateOf<SessionView?>(null)
    private var error by mutableStateOf<String?>(null)
    private var busy by mutableStateOf(false)
    private var polling: Job? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        // Step telemetry of the drop-in: step names and catalog codes only, never personal data or a decision.
        Sekyro.setEventListener { event ->
            events += when (event) {
                is SekyroEvent.Step -> event.step.wire + (event.retryReason?.let { " ($it)" } ?: "")
                SekyroEvent.WaitingForNetwork -> "waiting for network"
            }
        }
        setContent {
            MaterialTheme {
                Surface(Modifier.fillMaxSize()) {
                    Column(
                        Modifier.safeDrawingPadding().padding(16.dp).verticalScroll(rememberScrollState()),
                        verticalArrangement = Arrangement.spacedBy(12.dp),
                    ) {
                        Text("Sekyro Android example", style = MaterialTheme.typography.titleLarge)
                        Text(server.baseUrl, style = MaterialTheme.typography.bodySmall)
                        Button(onClick = ::start, enabled = !busy) { Text("Start verification") }
                        error?.let { Text(it, color = MaterialTheme.colorScheme.error) }
                        sessionId?.let { id ->
                            SelectionContainer { Text("Session $id") }
                            result?.let { Text("SDK result: $it") }
                            verdict?.let { Text("Server verdict: ${it.summary}") }
                            if (verdict?.isTerminal != true) FinishWithTestData(server, id, ::onFinished)
                        }
                        Text("Step events", style = MaterialTheme.typography.titleSmall)
                        events.forEach { Text(it) }
                    }
                }
            }
        }
    }

    override fun onDestroy() {
        Sekyro.setEventListener(null)
        super.onDestroy()
    }

    private fun start() {
        busy = true
        error = null
        events.clear()
        result = null
        verdict = null
        polling?.cancel()
        lifecycleScope.launch {
            try {
                // The client token is a one-time credential: it is handed to the SDK and never shown or logged.
                val session = server.createSession()
                sessionId = session.sessionId
                Sekyro.start(this@MainActivity, SekyroConfig(clientToken = session.clientToken)) { onResult(session.sessionId, it) }
            } catch (e: Exception) {
                error = e.message
            } finally {
                busy = false
            }
        }
    }

    /** What the person was shown: display only, never the decision. */
    private fun onResult(id: String, sdkResult: SekyroResult) {
        result = when (sdkResult) {
            is SekyroResult.Finished -> "finished: ${sdkResult.displayStatus.name.lowercase()}" + (sdkResult.reason?.let { " (${it.wire})" } ?: "")
            SekyroResult.Cancelled -> "cancelled"
            is SekyroResult.Failed -> "failed: ${sdkResult.code}"
        }
        pollVerdict(id)
    }

    private fun onFinished(view: SessionView) {
        verdict = view
        if (!view.isTerminal) pollVerdict(view.sessionId)
    }

    /** The decision is the server's: poll GET /sessions/:id until it is final (the webhook reaches the server too). */
    private fun pollVerdict(id: String) {
        polling?.cancel()
        polling = lifecycleScope.launch {
            repeat(30) {
                try {
                    val view = server.getSession(id)
                    verdict = view
                    if (view.isTerminal) return@launch
                } catch (e: Exception) {
                    error = e.message
                }
                delay(2_000)
            }
        }
    }
}
