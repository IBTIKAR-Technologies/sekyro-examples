package ai.sekyro.examples.androidcompose

import androidx.compose.foundation.layout.Column
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import kotlinx.coroutines.launch

/**
 * Debug builds only (this file is in the `debug` source set; `release` has an empty one): asks the server to end the
 * Sandbox session `verified` with test data, so the round trip (verdict and webhook) works on an emulator without a
 * document or a face. The server refuses it with a Live key.
 */
@Composable
fun FinishWithTestData(server: ExampleServer, sessionId: String, onFinished: (SessionView) -> Unit) {
    val scope = rememberCoroutineScope()
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    Column {
        OutlinedButton(
            enabled = !busy,
            onClick = {
                busy = true
                error = null
                scope.launch {
                    try {
                        onFinished(ExampleServer.decode(server.request("POST", "/demo/finish/${ExampleServer.escape(sessionId)}")))
                    } catch (e: Exception) {
                        error = e.message
                    } finally {
                        busy = false
                    }
                }
            },
        ) { Text("Finish with test data") }
        error?.let { Text(it, color = MaterialTheme.colorScheme.error) }
    }
}
