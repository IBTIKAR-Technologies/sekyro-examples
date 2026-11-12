plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.compose")
    id("org.jetbrains.kotlin.plugin.serialization")
}

/**
 * The examples/node-express server: `-PEXAMPLE_SERVER_URL=http://<host>:<port>` (or in ~/.gradle/gradle.properties).
 * Default: the host machine as the Android emulator sees it.
 */
val exampleServerUrl: String = (findProperty("EXAMPLE_SERVER_URL") as String?)?.takeIf { it.isNotBlank() } ?: "http://10.0.2.2:4000"
require('"' !in exampleServerUrl && '\\' !in exampleServerUrl) { "EXAMPLE_SERVER_URL: not a URL" }

android {
    namespace = "ai.sekyro.examples.androidcompose"
    compileSdk = 36

    defaultConfig {
        applicationId = "ai.sekyro.examples.androidcompose"
        minSdk = 24
        targetSdk = 36
        versionCode = 1
        versionName = "1.0"
        buildConfigField("String", "EXAMPLE_SERVER_URL", "\"$exampleServerUrl\"")
    }

    buildTypes {
        release {
            isMinifyEnabled = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"))
            // Signed with your machine's debug key so a release build installs locally; sign with your own key to ship.
            signingConfig = signingConfigs.getByName("debug")
        }
    }

    // Required by the Sekyro SDK: Bouncy Castle (chip reading) and jspecify ship duplicate META-INF files.
    packaging {
        resources.excludes += "META-INF/versions/9/OSGI-INF/MANIFEST.MF"
        resources.pickFirsts += listOf("META-INF/LICENSE.md", "META-INF/NOTICE.md", "META-INF/LICENSE.txt", "META-INF/NOTICE.txt")
    }

    buildFeatures {
        compose = true
        buildConfig = true
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_11
        targetCompatibility = JavaVersion.VERSION_11
    }
}

kotlin { compilerOptions { jvmTarget.set(org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_11) } }

dependencies {
    implementation(platform("ai.sekyro:sekyro-bom:0.1.0-rc.20"))
    implementation("ai.sekyro:sekyro-ui")

    implementation(platform("androidx.compose:compose-bom:2025.06.00"))
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.material3:material3")
    implementation("androidx.activity:activity-compose:1.10.1")
    implementation("androidx.lifecycle:lifecycle-runtime-ktx:2.9.1")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.10.2")
    implementation("org.jetbrains.kotlinx:kotlinx-serialization-json:1.9.0")

    testImplementation("junit:junit:4.13.2")
    testImplementation("org.jetbrains.kotlinx:kotlinx-coroutines-test:1.10.2")
}
