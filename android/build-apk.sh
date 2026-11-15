#!/usr/bin/env bash
# Build OfflineBible.apk without Gradle, using the command-line Android tools.
#
# Needs: JDK 11+, and either an Android SDK (ANDROID_HOME with build-tools and a
# platform >= 23) or the Debian/Ubuntu packages:
#   apt-get install android-sdk-platform-23 android-sdk-build-tools apksigner zipalign dalvik-exchange
#
# Output: android/build/OfflineBible.apk (signed with android/debug.keystore).
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(dirname "$HERE")"
SRC="$HERE/app/src/main"
OUT="$HERE/build"

PACKAGE="com.offlinebible.reader"
VERSION_CODE="${VERSION_CODE:-1}"
VERSION_NAME="${VERSION_NAME:-1.0}"
MIN_SDK=21
TARGET_SDK=34

SDK="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-/usr/lib/android-sdk}}"
ANDROID_JAR="${ANDROID_JAR:-$(ls -d "$SDK"/platforms/android-*/android.jar 2>/dev/null | sort -V | tail -1 || true)}"
[ -f "$ANDROID_JAR" ] || { echo "No android.jar found under $SDK/platforms" >&2; exit 1; }

tool() {  # find a build tool on PATH or in the newest build-tools dir
  command -v "$1" 2>/dev/null && return
  ls -d "$SDK"/build-tools/*/"$1" 2>/dev/null | sort -V | tail -1 || true
}
AAPT2="$(tool aapt2)"; ZIPALIGN="$(tool zipalign)"; APKSIGNER="$(tool apksigner)"
D8="$(tool d8)"; DX="$(command -v dalvik-exchange || tool dx || true)"
for t in AAPT2 ZIPALIGN APKSIGNER; do [ -n "${!t}" ] || { echo "Missing $t" >&2; exit 1; }; done
[ -n "$D8$DX" ] || { echo "Missing d8 or dx (dalvik-exchange)" >&2; exit 1; }

echo "Using $ANDROID_JAR"
rm -rf "$OUT"
mkdir -p "$OUT/assets/reader" "$OUT/assets/data/kjv" "$OUT/classes" "$OUT/dex"

# 1. Bundle the web reader and Bible text as app assets.
cp "$ROOT/index.html" "$OUT/assets/"
cp "$ROOT"/reader/*.js "$ROOT"/reader/*.css "$OUT/assets/reader/"
cp "$ROOT/data/kjv/kjv.js" "$OUT/assets/data/kjv/"

# 2. Resources + manifest. The source manifest has no package attribute (the Gradle
#    build sets it via `namespace`), so add it here.
sed "s|<manifest |<manifest package=\"$PACKAGE\" |" "$SRC/AndroidManifest.xml" > "$OUT/AndroidManifest.xml"
"$AAPT2" compile --dir "$SRC/res" -o "$OUT/res.zip"
"$AAPT2" link -o "$OUT/base.apk" -I "$ANDROID_JAR" \
  --manifest "$OUT/AndroidManifest.xml" -A "$OUT/assets" "$OUT/res.zip" \
  --min-sdk-version "$MIN_SDK" --target-sdk-version "$TARGET_SDK" \
  --version-code "$VERSION_CODE" --version-name "$VERSION_NAME" \
  --auto-add-overlay

# 3. Compile Java to dex.
javac -nowarn --release 8 -Xlint:-options -classpath "$ANDROID_JAR" -d "$OUT/classes" \
  $(find "$SRC/java" -name '*.java')
if [ -n "$D8" ]; then
  "$D8" --release --min-api "$MIN_SDK" --lib "$ANDROID_JAR" --output "$OUT/dex" $(find "$OUT/classes" -name '*.class')
else
  "$DX" --dex --min-sdk-version="$MIN_SDK" --output="$OUT/dex/classes.dex" "$OUT/classes"
fi
cp "$OUT/base.apk" "$OUT/unaligned.apk"
(cd "$OUT/dex" && zip -q -j "$OUT/unaligned.apk" classes.dex)

# 4. Align and sign.
"$ZIPALIGN" -f -p 4 "$OUT/unaligned.apk" "$OUT/aligned.apk"
"$APKSIGNER" sign --ks "$HERE/debug.keystore" --ks-pass pass:android --key-pass pass:android \
  --ks-key-alias offlinebible --min-sdk-version "$MIN_SDK" \
  --out "$OUT/OfflineBible.apk" "$OUT/aligned.apk"
"$APKSIGNER" verify "$OUT/OfflineBible.apk"

rm -f "$OUT"/base.apk "$OUT"/unaligned.apk "$OUT"/aligned.apk "$OUT"/res.zip
ls -l "$OUT/OfflineBible.apk"
