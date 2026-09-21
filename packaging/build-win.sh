#!/bin/sh
# Portable Windows bundle: Electron app + production web build, no installer required.
# Output: dist/agent-hub_<VERSION>_win-x64.zip (+ .sha256).
# Requires: bun, zip/unzip, curl. Runtimes download on demand (cached in stage dir).
set -eu

ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
OUT="$ROOT/dist"
VERSION="${VERSION:-0.1.0}"
UPDATE_REPOSITORY="${UPDATE_REPOSITORY:-}"
STAGE="$ROOT/.package-stage/agent-hub_${VERSION}_win-x64"

command -v zip >/dev/null 2>&1 || { echo "zip is required (apt install zip)" >&2; exit 1; }

bun run --cwd "$ROOT/apps/web" build
bun run --cwd "$ROOT/apps/desktop" typecheck

rm -rf "$STAGE"
mkdir -p "$STAGE/agent-hub" "$OUT"

cp -a "$ROOT/apps" "$STAGE/agent-hub/"
cp -a "$ROOT/packages" "$STAGE/agent-hub/"
for item in package.json bun.lock pnpm-workspace.yaml tsconfig.base.json DESIGN.md UX-CONTRACT.md README.md; do
  [ -e "$ROOT/$item" ] && cp -a "$ROOT/$item" "$STAGE/agent-hub/"
done
rm -rf "$STAGE/agent-hub/apps/web/.next/cache"

# Bun win-x64 runtime (cached so re-runs are offline-safe).
BUN_CACHE="$STAGE/.bun-cache"
mkdir -p "$BUN_CACHE"
BUN_ZIP="$BUN_CACHE/bun-windows-x64.zip"
if [ ! -f "$BUN_ZIP" ]; then
  echo "Downloading Bun win-x64…" >&2
  curl --fail --silent --show-error --location \
    "https://github.com/oven-sh/bun/releases/latest/download/bun-windows-x64.zip" \
    -o "$BUN_ZIP"
fi
mkdir -p "$STAGE/agent-hub/bin"
unzip -p "$BUN_ZIP" "bun-windows-x64/bun.exe" > "$STAGE/agent-hub/bin/bun.exe"
chmod 0755 "$STAGE/agent-hub/bin/bun.exe"

# Windows web-service launcher (sibling of the Electron app dir).
cat > "$STAGE/agent-hub/agent-hub.cmd" <<'SCRIPT'
@echo off
setlocal
set "APP_ROOT=%~dp0"
set "PORT=%PORT:=%"
if "%PORT%"=="" set PORT=3010
set "BUN_INSTALL=%APP_ROOT%.bun"
"%APP_ROOT%bin\bun.exe" run --cwd "%APP_ROOT%apps\web" start --hostname 127.0.0.1 --port %PORT%
SCRIPT

# Electron win32 runtime (cached so re-runs are offline-safe).
ELECTRON_VERSION=$(bun --cwd "$ROOT/apps/desktop" -e 'console.log(require("./node_modules/electron/package.json").version)')
ELECTRON_CACHE="$STAGE/.electron-cache"
mkdir -p "$ELECTRON_CACHE"
ELECTRON_ZIP="$ELECTRON_CACHE/electron-v${ELECTRON_VERSION}-win32-x64.zip"
if [ ! -f "$ELECTRON_ZIP" ]; then
  echo "Downloading Electron ${ELECTRON_VERSION} win32-x64…" >&2
  curl --fail --silent --show-error --location \
    "https://github.com/electron/electron/releases/download/v${ELECTRON_VERSION}/electron-v${ELECTRON_VERSION}-win32-x64.zip" \
    -o "$ELECTRON_ZIP"
fi
mkdir -p "$STAGE/agent-hub/electron-win"
unzip -q -o "$ELECTRON_ZIP" -d "$STAGE/agent-hub/electron-win"

# Desktop launcher shim + update repo pointer.
mkdir -p "$STAGE/agent-hub/apps/desktop/bin"
cat > "$STAGE/agent-hub/apps/desktop/bin/electron.cmd" <<'SCRIPT'
@echo off
setlocal
"%~dp0..\..\electron-win\electron.exe" "%~dp0.." %*
SCRIPT
if [ -n "$UPDATE_REPOSITORY" ]; then
  printf '%s\n' "AGENT_HUB_UPDATE_REPOSITORY=$UPDATE_REPOSITORY" > "$STAGE/agent-hub/apps/desktop/update.env"
fi

(cd "$STAGE" && zip -qr "$OUT/agent-hub_${VERSION}_win-x64.zip" "agent-hub")
(cd "$OUT" && sha256sum "agent-hub_${VERSION}_win-x64.zip" > "agent-hub_${VERSION}_win-x64.zip.sha256")
ls -la "$OUT/agent-hub_${VERSION}_win-x64.zip"
