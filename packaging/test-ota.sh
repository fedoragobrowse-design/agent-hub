#!/bin/sh
set -eu

ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
WORK=$(mktemp -d /tmp/agent-hub-ota.XXXXXX)
trap 'rm -rf "$WORK"' EXIT
mkdir -p "$WORK/bin" "$WORK/cache"

printf '%s\n' 'UPDATE_REPOSITORY=example/agent-hub' 'UPDATE_CHANNEL=stable' > "$WORK/update.conf"
printf '%s\n' '{' '  "tag_name": "v0.2.0"' '}' > "$WORK/release.json"
printf '%s\n' 'safe fixture package' > "$WORK/agent-hub_0.2.0_amd64.deb"
(cd "$WORK" && sha256sum agent-hub_0.2.0_amd64.deb > agent-hub_0.2.0_amd64.deb.sha256)

cat > "$WORK/bin/curl" <<'SCRIPT'
#!/bin/sh
set -eu
dest=
previous=
for argument in "$@"; do
  [ "$previous" = "-o" ] && dest=$argument
  previous=$argument
done
case "$*" in
  *api.github.com*) cat "$OTA_FIXTURE/release.json" ;;
  *.deb.sha256*) cp "$OTA_FIXTURE/agent-hub_0.2.0_amd64.deb.sha256" "$dest" ;;
  *.deb*) cp "$OTA_FIXTURE/agent-hub_0.2.0_amd64.deb" "$dest" ;;
  *) exit 1 ;;
esac
SCRIPT
cat > "$WORK/bin/dpkg-query" <<'SCRIPT'
#!/bin/sh
printf '%s\n' "${CURRENT_VERSION:-0.1.0}"
SCRIPT
cat > "$WORK/bin/dpkg" <<'SCRIPT'
#!/bin/sh
set -eu
[ "$1" = "-i" ]
[ -f "$2" ]
touch "$OTA_FIXTURE/installed"
SCRIPT
chmod 0755 "$WORK/bin/curl" "$WORK/bin/dpkg-query" "$WORK/bin/dpkg"

PATH="$WORK/bin:$PATH" OTA_FIXTURE="$WORK" \
  AGENT_HUB_UPDATE_CONFIG="$WORK/update.conf" \
  AGENT_HUB_UPDATE_CACHE="$WORK/cache" \
  sh "$ROOT/packaging/ota/agent-hub-update"
test -f "$WORK/installed"

rm -f "$WORK/installed"
PATH="$WORK/bin:$PATH" OTA_FIXTURE="$WORK" CURRENT_VERSION=0.2.0 \
  AGENT_HUB_UPDATE_CONFIG="$WORK/update.conf" \
  AGENT_HUB_UPDATE_CACHE="$WORK/cache" \
  sh "$ROOT/packaging/ota/agent-hub-update"
test ! -e "$WORK/installed"

printf '%s\n' 'OTA update and no-op paths verified'
