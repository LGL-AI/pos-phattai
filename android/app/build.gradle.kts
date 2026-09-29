plugins {
    id("com.android.application")
}

android {
    namespace = "vn.lotusai.pos.phattaiapp"
    compileSdk = 35

    defaultConfig {
        applicationId = "vn.lotusai.pos.phattaiapp"
        minSdk = 23
        targetSdk = 35
        versionCode = 156
        versionName = "1.5.6"
    }

    buildTypes {
        release {
            isMinifyEnabled = false
        }
    }
}

dependencies {
    implementation(files("libs/printerlibrary-1.0.18.aar"))
}
