import java.io.FileInputStream
import java.util.Properties

plugins {
    id("com.android.application")
    id("kotlin-android")
    // The Flutter Gradle Plugin must be applied after the Android and Kotlin Gradle plugins.
    id("dev.flutter.flutter-gradle-plugin")
}

// Release signing (CW-060). Android installs an update only when it is signed
// with the same key as the version already on the phone, so every release is
// signed with one key, kept out of this repository: in android/key.properties
// on a maintainer's machine, or in the release workflow's secrets (see
// docs/mobile-release.md). Without either, a local release build falls back
// to the debug key — fine for `flutter run --release`, and refused where
// CWORK_REQUIRE_RELEASE_SIGNING is set, so a debug-signed APK is never handed
// out: every employee would have to uninstall it, and lose what it held, to
// take the next update.
val keystoreProperties = Properties().apply {
    val file = rootProject.file("key.properties")
    if (file.exists()) FileInputStream(file).use { load(it) }
}

fun signingValue(property: String, environment: String): String? =
    keystoreProperties.getProperty(property) ?: System.getenv(environment)?.takeIf { it.isNotBlank() }

val releaseKeystore: String? = signingValue("storeFile", "CWORK_KEYSTORE_PATH")
val requireReleaseSigning = System.getenv("CWORK_REQUIRE_RELEASE_SIGNING") == "true"

if (requireReleaseSigning && releaseKeystore == null) {
    throw GradleException(
        "CWORK_REQUIRE_RELEASE_SIGNING is set but no release keystore is configured. " +
            "See docs/mobile-release.md.",
    )
}

android {
    namespace = "com.cwork.app"
    compileSdk = flutter.compileSdkVersion
    ndkVersion = flutter.ndkVersion

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_11
        targetCompatibility = JavaVersion.VERSION_11
    }

    kotlinOptions {
        jvmTarget = JavaVersion.VERSION_11.toString()
    }

    defaultConfig {
        // Never change: Android treats a different id as a different app, which
        // installs beside this one instead of updating it.
        applicationId = "com.cwork.app"
        minSdk = flutter.minSdkVersion
        targetSdk = flutter.targetSdkVersion
        // The release workflow sets both from the version being released:
        // x.y.z is versionName x.y.z and versionCode x*1000000 + y*1000 + z, so
        // every release is higher than the last and installs over it.
        versionCode = flutter.versionCode
        versionName = flutter.versionName
    }

    signingConfigs {
        releaseKeystore?.let { path ->
            create("release") {
                storeFile = file(path)
                storePassword = signingValue("storePassword", "CWORK_KEYSTORE_PASSWORD")
                keyAlias = signingValue("keyAlias", "CWORK_KEY_ALIAS")
                keyPassword = signingValue("keyPassword", "CWORK_KEY_PASSWORD")
            }
        }
    }

    buildTypes {
        release {
            signingConfig =
                if (releaseKeystore != null) {
                    signingConfigs.getByName("release")
                } else {
                    signingConfigs.getByName("debug")
                }
        }
    }
}

flutter {
    source = "../.."
}
