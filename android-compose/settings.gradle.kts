pluginManagement {
    repositories {
        google()
        mavenCentral()
        gradlePluginPortal()
    }
}

dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        google()
        // The Sekyro Android SDK (ai.sekyro:*) is on Maven Central.
        mavenCentral()
    }
}

rootProject.name = "sekyro-example-android-compose"
include(":app")
