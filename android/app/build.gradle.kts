import groovy.json.JsonSlurper

plugins {
    id("com.android.application")
}

val identityConfig = JsonSlurper().parse(rootProject.file("app-identity.json")) as Map<*, *>
val productionAppId = identityConfig["productionApplicationId"] as String
val installProfiles = identityConfig["profiles"] as Map<*, *>
val selectedAppId = providers.environmentVariable("LOTUS_APP_ID").getOrElse(productionAppId)
// CI injects a fresh, increasing version for every published APK; local builds use app-identity.json.
val releaseVersionCode = providers.environmentVariable("LOTUS_VERSION_CODE").getOrElse((identityConfig["versionCode"] as Number).toString()).toInt()
val releaseVersionName = providers.environmentVariable("LOTUS_VERSION_NAME").getOrElse(identityConfig["versionName"] as String)
val allowUnsignedProof = providers.environmentVariable("LOTUS_UNSIGNED_BUILD").getOrElse("0") == "1"
val releaseKeystore = providers.environmentVariable("LOTUS_KEYSTORE").orNull
val releaseAlias = providers.environmentVariable("LOTUS_KEY_ALIAS").orNull
val releasePassword = providers.environmentVariable("LOTUS_KEYSTORE_PASSWORD").orNull
val hasReleaseKey = !releaseKeystore.isNullOrBlank() && !releaseAlias.isNullOrBlank() && !releasePassword.isNullOrBlank()
val hasInjectedSigning = providers.gradleProperty("android.injected.signing.store.file").isPresent
require(installProfiles.containsKey(selectedAppId)) {
    "Unsupported LOTUS_APP_ID='$selectedAppId'. Select a pinned Android profile."
}
require(selectedAppId == productionAppId || providers.environmentVariable("LOTUS_ALLOW_ALT_APP_ID").getOrElse("0") == "1") {
    "LOTUS_APP_ID='$selectedAppId' differs from production. Set LOTUS_ALLOW_ALT_APP_ID=1 only for an intentional alternate package build."
}

android {
    namespace = identityConfig["namespace"] as String
    compileSdk = 35
    buildToolsVersion = "35.0.1"

    defaultConfig {
        applicationId = selectedAppId
        minSdk = 23
        targetSdk = 35
        versionCode = releaseVersionCode
        versionName = releaseVersionName
    }

    signingConfigs {
        if (hasReleaseKey) create("lotusRelease") {
            storeFile = file(releaseKeystore!!)
            storePassword = releasePassword
            keyAlias = releaseAlias
            keyPassword = providers.environmentVariable("LOTUS_KEY_PASSWORD").getOrElse(releasePassword!!)
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            if (hasReleaseKey) signingConfig = signingConfigs.getByName("lotusRelease")
        }
    }
}

dependencies {
    implementation(files("libs/printerlibrary-1.0.18.aar"))
}


val syncStaffAssets by tasks.registering(Sync::class) {
    from(rootProject.projectDir.resolve("../public/staff"))
    into(projectDir.resolve("src/main/assets/staff"))
}
val verifyPosRelease by tasks.registering(Exec::class) {
    dependsOn(syncStaffAssets)
    workingDir(rootProject.projectDir.resolve(".."))
    commandLine("node", "scripts/verify-release.mjs")
}
tasks.named("preBuild") { dependsOn(verifyPosRelease) }
tasks.matching { it.name == "preReleaseBuild" }.configureEach {
    doFirst {
        require(hasReleaseKey || hasInjectedSigning || allowUnsignedProof) {
            "Release APK requires the original signing keystore. Set LOTUS_UNSIGNED_BUILD=1 only for an unsigned compilation proof."
        }
    }
}

val verifyBuiltReleaseApks by tasks.registering(Exec::class) {
    workingDir(rootProject.projectDir.resolve(".."))
    val sdkTools = android.sdkDirectory.resolve("build-tools/35.0.1")
    val aaptName = if (System.getProperty("os.name").startsWith("Windows")) "aapt2.exe" else "aapt2"
    val verifierArgs = mutableListOf("node", "scripts/verify-apk-identity.mjs",
        "--directory", projectDir.resolve("build/outputs/apk/release").absolutePath,
        "--aapt2", sdkTools.resolve(aaptName).absolutePath,
        "--apksigner-jar", sdkTools.resolve("lib/apksigner.jar").absolutePath)
    if (allowUnsignedProof) verifierArgs.add("--allow-unsigned")
    commandLine(verifierArgs)
}
tasks.matching { it.name == "assembleRelease" }.configureEach {
    finalizedBy(verifyBuiltReleaseApks)
}
