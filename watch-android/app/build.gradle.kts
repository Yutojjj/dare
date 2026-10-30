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
        versionCode = 30
        versionName = "2.25"
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
    "testImplementation"("junit:junit:4.13.2")
    "testImplementation"("org.json:json:20250517")
    "webPreviewImplementation"("androidx.wear.tiles:tiles:1.4.1")
    "webPreviewImplementation"("androidx.wear.protolayout:protolayout:1.2.1")
    "webPreviewImplementation"("org.mozilla.geckoview:geckoview:146.0.20251217121356")
}



















