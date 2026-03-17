// App-level build.gradle.kts
// Applies the Google Services plugin to process google-services.json

plugins {
    id("com.android.application")
    id("com.google.gms.google-services") // Must be LAST plugin
}

android {
    namespace = "com.dtr.system"
    compileSdk = 34

    defaultConfig {
        applicationId = "com.dtr.system"
        minSdk = 21
        targetSdk = 34
        versionCode = 1
        versionName = "1.0.0"
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}

dependencies {
    // Firebase BoM - manages all Firebase library versions
    implementation(platform("com.google.firebase:firebase-bom:33.0.0"))
    implementation("com.google.firebase:firebase-analytics")
    implementation("com.google.firebase:firebase-firestore")
    implementation("com.google.firebase:firebase-auth")
}