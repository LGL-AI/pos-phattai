#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
UNSIGNED=0
if [[ $# -eq 1 && "$1" == "--unsigned" ]]; then
  UNSIGNED=1
elif [[ $# -ne 0 ]]; then
  echo "Usage: bash android/build-local.sh [--unsigned]" >&2
  exit 1
fi
IDENTITY_FIELDS="$(node "$PROJECT_DIR/../scripts/android-identity.mjs" --build-fields)"
mapfile -t IDENTITY <<< "$IDENTITY_FIELDS"
if [[ ${#IDENTITY[@]} -ne 6 ]]; then echo "Invalid Android build profile." >&2; exit 1; fi
APP_ID="${IDENTITY[0]}"
EXPECTED_SIGNER="${IDENTITY[1]}"
JAVA_NAMESPACE="${IDENTITY[2]}"
APP_VERSION="${IDENTITY[3]}"
APP_VERSION_CODE="${IDENTITY[4]}"
ARTIFACT_STEM="${IDENTITY[5]}"
SDK_ROOT="${ANDROID_SDK_ROOT:-$PROJECT_DIR/../../../android_toolchain/sdk}"
BUILD_TOOLS_VERSION="35.0.1"
PLATFORM_VERSION="android-35"
TOOLS="$SDK_ROOT/build-tools/$BUILD_TOOLS_VERSION"
ANDROID_JAR="$SDK_ROOT/platforms/$PLATFORM_VERSION/android.jar"
BUILD_DIR="$PROJECT_DIR/build/manual"
APP_DIR="$PROJECT_DIR/app/src/main"
PRINTER_AAR="$PROJECT_DIR/app/libs/printerlibrary-1.0.18.aar"
PRINTER_JAR="$BUILD_DIR/vendor/printerlibrary-1.0.18.jar"
ASSETS="$BUILD_DIR/assets"
KEYSTORE="${LOTUS_KEYSTORE:-$PROJECT_DIR/signing/original-release.jks}"
JAVAC_BIN="${JAVAC_BIN:-$(command -v javac || true)}"
OUTPUT_APK="$PROJECT_DIR/dist/${ARTIFACT_STEM}_v${APP_VERSION}_APP_UPDATE.apk"
if [[ $UNSIGNED -eq 1 ]]; then
  OUTPUT_APK="${OUTPUT_APK%.apk}_UNSIGNED.apk"
else
  if [[ ! -f "$KEYSTORE" ]]; then
    echo "Missing original signing keystore for $APP_ID: $KEYSTORE" >&2
    echo "Supply the original profile key through LOTUS_KEYSTORE; a new key cannot update the installed app." >&2
    exit 1
  fi
  KEY_ALIAS="${LOTUS_KEY_ALIAS:?Set the original key alias in LOTUS_KEY_ALIAS}"
  if [[ -z "${LOTUS_KEYSTORE_PASSWORD:-}" ]]; then echo "Set LOTUS_KEYSTORE_PASSWORD for the original signing key." >&2; exit 1; fi
  export LOTUS_KEY_PASSWORD="${LOTUS_KEY_PASSWORD:-$LOTUS_KEYSTORE_PASSWORD}"
  KEY_OPTIONS=(--ks-pass env:LOTUS_KEYSTORE_PASSWORD --key-pass env:LOTUS_KEY_PASSWORD)
fi
echo "Android build: applicationId=$APP_ID version=$APP_VERSION code=$APP_VERSION_CODE unsigned=$UNSIGNED"

for required in "$TOOLS/aapt2" "$TOOLS/d8" "$TOOLS/zipalign" "$TOOLS/apksigner" "$ANDROID_JAR" "$PRINTER_AAR" "$JAVAC_BIN"; do
  if [[ ! -e "$required" ]]; then
    echo "Missing Android tool: $required" >&2
    exit 1
  fi
done

(cd "$PROJECT_DIR/.." && npm run release:gate)

mkdir -p "$BUILD_DIR/compiled" "$BUILD_DIR/generated" "$BUILD_DIR/classes" "$BUILD_DIR/dex" \
  "$BUILD_DIR/vendor" "$PROJECT_DIR/dist" "$PROJECT_DIR/signing" "$ASSETS/staff"

find "$BUILD_DIR/compiled" "$BUILD_DIR/generated" "$BUILD_DIR/classes" "$BUILD_DIR/dex" -mindepth 1 -delete
find "$ASSETS" -mindepth 1 -delete
cp -a "$APP_DIR/assets/." "$ASSETS/"
unzip -p "$PRINTER_AAR" classes.jar > "$PRINTER_JAR"

"$TOOLS/aapt2" compile --dir "$APP_DIR/res" -o "$BUILD_DIR/compiled/resources.zip"
node "$PROJECT_DIR/../scripts/android-manifest.mjs" "$BUILD_DIR/AndroidManifest.xml"

"$TOOLS/aapt2" link \
  -o "$BUILD_DIR/app-unsigned.apk" \
  -I "$ANDROID_JAR" \
  --manifest "$BUILD_DIR/AndroidManifest.xml" \
  --rename-manifest-package "$APP_ID" \
  --custom-package "$JAVA_NAMESPACE" \
  --min-sdk-version 23 \
  --target-sdk-version 35 \
  --version-code "$APP_VERSION_CODE" \
  --version-name "$APP_VERSION" \
  -A "$ASSETS" \
  --java "$BUILD_DIR/generated" \
  "$BUILD_DIR/compiled/resources.zip"

find "$APP_DIR/java" "$BUILD_DIR/generated" -name '*.java' -not -path '*/.rsync-tmp/*' -print0 | \
  xargs -0 "$JAVAC_BIN" -encoding UTF-8 -source 8 -target 8 -classpath "$ANDROID_JAR:$PRINTER_JAR" -d "$BUILD_DIR/classes"

find "$BUILD_DIR/classes" -name '*.class' -not -path '*/.rsync-tmp/*' -print0 | \
  xargs -0 "$TOOLS/d8" --min-api 23 --lib "$ANDROID_JAR" --output "$BUILD_DIR/dex" "$PRINTER_JAR"

cp "$BUILD_DIR/app-unsigned.apk" "$BUILD_DIR/app-with-dex.apk"
zip -q -j "$BUILD_DIR/app-with-dex.apk" "$BUILD_DIR/dex/classes.dex"
"$TOOLS/zipalign" -f -p 4 "$BUILD_DIR/app-with-dex.apk" "$BUILD_DIR/app-aligned.apk"

if [[ $UNSIGNED -eq 1 ]]; then
  cp "$BUILD_DIR/app-aligned.apk" "$OUTPUT_APK"
  if ! node "$PROJECT_DIR/../scripts/verify-apk-identity.mjs" "$OUTPUT_APK" --aapt2 "$TOOLS/aapt2" --allow-unsigned; then rm -f "$OUTPUT_APK"; exit 1; fi
  (cd "$PROJECT_DIR/dist" && sha256sum "$(basename "$OUTPUT_APK")" > "$(basename "$OUTPUT_APK").sha256")
  echo "Built unsigned verification APK: $OUTPUT_APK (not installable/distributable)"
  exit 0
fi

if [[ "$EXPECTED_SIGNER" == "" ]]; then
  echo "Missing pinned signer; refusing release." >&2
  exit 1
fi
"$TOOLS/apksigner" sign \
  --ks "$KEYSTORE" \
  "${KEY_OPTIONS[@]}" \
  --ks-key-alias "$KEY_ALIAS" \
  --out "$OUTPUT_APK" \
  "$BUILD_DIR/app-aligned.apk"

if ! node "$PROJECT_DIR/../scripts/verify-apk-identity.mjs" "$OUTPUT_APK" --aapt2 "$TOOLS/aapt2" --apksigner-jar "$TOOLS/lib/apksigner.jar"; then rm -f "$OUTPUT_APK"; exit 1; fi
(cd "$PROJECT_DIR/dist" && sha256sum "$(basename "$OUTPUT_APK")" > SHA256SUMS.txt)
echo "Built: $OUTPUT_APK"
