plugins {
    id("com.android.application")
}

android {
    namespace = "jp.dare.watch"
    compileSdk = 36

    defaultConfig {
        applicationId = "jp.dare.watch"
        minSdk = 30
        targetSdk = 35
        versionCode = 28
        versionName = "2.23"
        ndk { abiFilters += listOf("armeabi-v7a") }
    }

    buildTypes {
        create("webPreview") {
            initWith(getByName("debug"))
            applicationIdSuffix = ".webpreview"
            matchingFallbacks += listOf("debug")
        }
        release {
            isMinifyEnabled = false
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}

dependencies {
    "webPreviewImplementation"("org.mozilla.geckoview:geckoview:146.0.20251217121356")
}



















