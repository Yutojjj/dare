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
        versionCode = 24
        versionName = "2.19"
    }

    buildTypes {
        release {
            isMinifyEnabled = false
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}



















