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
        maven("https://maven.mozilla.org/maven2/")
        google()
        mavenCentral()
    }
}

rootProject.name = "DareWatch"
include(":app")
