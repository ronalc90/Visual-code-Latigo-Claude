#!/bin/sh
# Compila la app de escritorio del latigo (macOS 13+) en build/Látigo.app.
# Uso: desktop/build.sh            (desde la raiz del repo o desde desktop/)
#      desktop/build.sh --test     (ademas corre las pruebas)
set -eu
cd "$(dirname "$0")"
ROOT=$(cd .. && pwd)
OUT=build
APP="$OUT/Látigo.app"
ARCH=$(uname -m)

# Los niveles y los sonidos salen de hooks/levels.ts y hooks/sounds.ts: una sola fuente de verdad.
TMP=$(mktemp -d)
npx -y esbuild@0.24.0 "$ROOT/hooks/levels.ts" --bundle --format=esm --outfile="$TMP/levels.mjs" --log-level=warning
node "$ROOT/scripts/niveles_app.mjs" "$TMP/levels.mjs" > Resources/niveles.json
npx -y esbuild@0.24.0 "$ROOT/hooks/sounds.ts" --bundle --format=esm --outfile="$TMP/sounds.mjs" --log-level=warning
node "$ROOT/scripts/sonidos_app.mjs" "$TMP/sounds.mjs" > Resources/sonidos.json
rm -rf "$TMP"

rm -rf "$APP"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"
# Universal: corre nativa en Intel y en Apple Silicon.
for TARGET in arm64 x86_64; do
  swiftc -O -swift-version 5 -target "$TARGET-apple-macos13.0" \
    -framework AppKit -framework AVFoundation -framework Carbon -framework ServiceManagement \
    Sources/*.swift -o "$OUT/Latigo-$TARGET"
done
lipo -create "$OUT/Latigo-arm64" "$OUT/Latigo-x86_64" -output "$APP/Contents/MacOS/Latigo"
rm -f "$OUT/Latigo-arm64" "$OUT/Latigo-x86_64"
cp Info.plist "$APP/Contents/Info.plist"
cp Resources/niveles.json Resources/sonidos.json "$ROOT/assets/nivel.wav" "$APP/Contents/Resources/"
mkdir -p "$APP/Contents/Resources/sonidos"
cp "$ROOT"/assets/sonidos/*.wav "$APP/Contents/Resources/sonidos/"
cp Resources/AppIcon.icns "$APP/Contents/Resources/" 2>/dev/null || true
# Firma local (ad hoc): basta para correrla en esta Mac.
codesign --force --sign - "$APP" >/dev/null
# Zip para adjuntar a la version de GitHub.
(cd "$OUT" && rm -f Latigo-macOS.zip && ditto -c -k --keepParent "Látigo.app" Latigo-macOS.zip)
echo "listo $APP"

if [ "${1:-}" = "--test" ]; then
  TEST_SOURCES=$(ls Sources/*.swift | grep -v '/main.swift$')
  swiftc -O -swift-version 5 -target "$ARCH-apple-macos13.0" \
    -framework AppKit -framework AVFoundation -framework Carbon -framework ServiceManagement \
    $TEST_SOURCES Tests/*.swift -o "$OUT/latigo-tests"
  "$OUT/latigo-tests" "$PWD/Resources/niveles.json" "$PWD/Resources/sonidos.json" "$ROOT/assets"
fi
