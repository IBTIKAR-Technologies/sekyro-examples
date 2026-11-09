package ai.sekyro.examples.androidcompose

import androidx.compose.runtime.Composable

/** Release builds carry no test input: the debug source set has the real button. */
@Suppress("UNUSED_PARAMETER")
@Composable
fun FinishWithTestData(server: ExampleServer, sessionId: String, onFinished: (SessionView) -> Unit) = Unit
