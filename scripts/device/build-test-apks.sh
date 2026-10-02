#!/usr/bin/env bash
# Two test builds (9.0.1 and 9.0.2) of the shop's code. Only differences: an alternate package name
# with a throwaway signing key, so they can never install over the real app, and the test Worker URL.
set -euo pipefail
: "${TEST_WORKER_URL:?}" "${TEST_APP_ID:?}"
mkdir -p device
keytool -genkeypair -keystore device/test.jks -storepass devicetest -keypass devicetest -alias devicetest \
  -keyalg RSA -keysize 2048 -validity 30 -dname "CN=Lotus POS device test" 2>/dev/null
signer=$(keytool -list -v -keystore device/test.jks -storepass devicetest -alias devicetest | sed -n 's/^[[:space:]]*SHA256: //p' | head -1 | tr -d ':' | tr 'A-F' 'a-f')
[ ${#signer} -eq 64 ] || { echo "could not read the test signer"; exit 1; }
echo "TEST_SIGNER=$signer" >> "$GITHUB_ENV"
node -e 'const fs=require("fs"),p="android/app-identity.json",j=JSON.parse(fs.readFileSync(p));j.profiles[process.argv[1]]={artifactStem:"LotusPOS_DeviceTest",signerSha256:process.argv[2]};fs.writeFileSync(p,JSON.stringify(j,null,2)+"\n")' "$TEST_APP_ID" "$signer"
src=android/app/src/main/java/vn/lotusai/pos/phattaiapp
sed -i "s#https://pos-phattai.lgl247-ai.workers.dev#${TEST_WORKER_URL}#g" "$src/MainActivity.java" "$src/CloudConnectivityActivity.java"
grep -q "$TEST_WORKER_URL" "$src/MainActivity.java"
export LOTUS_APP_ID="$TEST_APP_ID" LOTUS_ALLOW_ALT_APP_ID=1 LOTUS_KEYSTORE="$PWD/device/test.jks" LOTUS_KEY_ALIAS=devicetest LOTUS_KEYSTORE_PASSWORD=devicetest
for v in 1 2; do
  rm -rf android/app/build/outputs/apk/release
  (cd android && LOTUS_VERSION_CODE=200000$v LOTUS_VERSION_NAME=9.0.$v ./gradlew --no-daemon --quiet assembleRelease -x verifyPosRelease)
  cp android/app/build/outputs/apk/release/*.apk "device/test-v$v.apk"
done
ls -l device/*.apk
# Put 9.0.2 on the test Worker's update channel (writes src/android-releases.json and public/releases/).
LOTUS_VERSION_CODE=2000002 LOTUS_VERSION_NAME=9.0.2 node scripts/publish-android-release.mjs device/test-v2.apk \
  --notes-vi "Bản thử trên máy ảo" --notes-zh "模拟器测试版"
