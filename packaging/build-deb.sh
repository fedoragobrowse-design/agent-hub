#!/bin/sh
set -eu

ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
OUT="$ROOT/dist"
VERSION="${VERSION:-0.1.0}"
STAGE="$ROOT/.package-stage/agent-hub_${VERSION}_amd64"
BUN_BIN="${BUN_BIN:?Set BUN_BIN to the Bun executable used for packaging}"
UPDATE_REPOSITORY="${UPDATE_REPOSITORY:-}"
"$BUN_BIN" run --cwd "$ROOT/apps/web" build
"$BUN_BIN" run --cwd "$ROOT/apps/desktop" typecheck

rm -rf "$STAGE"
rm -f "$OUT/agent-hub_${VERSION}_amd64.deb"
mkdir -p "$STAGE/DEBIAN" "$STAGE/usr/lib/agent-hub/bin" "$STAGE/usr/bin" "$STAGE/lib/systemd/system" "$STAGE/usr/share/applications"
sed "s|@VERSION@|$VERSION|g" "$ROOT/packaging/debian/control" > "$STAGE/DEBIAN/control"
chmod 0644 "$STAGE/DEBIAN/control"
install -m 0755 "$ROOT/packaging/debian/postinst" "$STAGE/DEBIAN/postinst"
install -m 0755 "$ROOT/packaging/debian/agent-hub" "$STAGE/usr/bin/agent-hub"
install -m 0755 "$ROOT/packaging/debian/agent-hub-desktop" "$STAGE/usr/bin/agent-hub-desktop"
install -m 0644 "$ROOT/packaging/debian/environment" "$STAGE/usr/lib/agent-hub/environment"
install -m 0644 "$ROOT/packaging/debian/agent-hub.desktop" "$STAGE/usr/share/applications/agent-hub.desktop"
install -m 0755 "$ROOT/packaging/ota/agent-hub-update" "$STAGE/usr/lib/agent-hub/bin/agent-hub-update"
install -m 0644 "$ROOT/packaging/ota/agent-hub-update.service" "$STAGE/lib/systemd/system/agent-hub-update.service"
install -m 0644 "$ROOT/packaging/ota/agent-hub-update.timer" "$STAGE/lib/systemd/system/agent-hub-update.timer"
sed "s|@UPDATE_REPOSITORY@|$UPDATE_REPOSITORY|g" "$ROOT/packaging/ota/update.conf" > "$STAGE/usr/lib/agent-hub/update.conf"
chmod 0644 "$STAGE/usr/lib/agent-hub/update.conf"
cp "$BUN_BIN" "$STAGE/usr/lib/agent-hub/bin/bun"
chmod 0755 "$STAGE/usr/lib/agent-hub/bin/bun"

for item in apps packages node_modules package.json bun.lock pnpm-workspace.yaml tsconfig.base.json DESIGN.md UX-CONTRACT.md README.md; do
  [ -e "$ROOT/$item" ] && cp -a "$ROOT/$item" "$STAGE/usr/lib/agent-hub/"
done
rm -rf "$STAGE/usr/lib/agent-hub/node_modules/.old_modules-"*
mkdir -p "$OUT"
dpkg-deb --root-owner-group --build "$STAGE" "$OUT/agent-hub_${VERSION}_amd64.deb"
dpkg-deb --info "$OUT/agent-hub_${VERSION}_amd64.deb"
