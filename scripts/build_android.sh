#!/usr/bin/env bash
set -euo pipefail

SLUG="paint-board"
PACKAGE_ID="co.harrishill.paintboard"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUTPUT_REL="Builds/Android/${SLUG}-debug.apk"
OUTPUT_APK="$ROOT_DIR/$OUTPUT_REL"
BUILD_WEB=1
INSTALL=0
LAUNCH=0
STATUS=0
WEB_TARGET="web"

usage() {
    cat <<USAGE
Usage:
  ./scripts/build_android.sh [--install] [--launch] [--status] [--skip-web-build] [--web-target web|raw]

Builds the Vite web app, assembles the Android debug APK, and copies it to:
  $OUTPUT_REL

Options:
  --install          Install the copied APK with bdb.
  --launch           Install, then launch $PACKAGE_ID with bdb.
  --status           Run bdb status before install/launch.
  --skip-web-build   Reuse the existing web/dist directory.
  --web-target raw   Build the raw bridge test page instead of web/dist.
USAGE
}

die() {
    printf 'Error: %s\n' "$1" >&2
    printf '\n' >&2
    usage >&2
    exit 1
}

resolve_bdb() {
    if [ -n "${BDB_BIN:-}" ]; then
        if [ -x "$BDB_BIN" ] || command -v "$BDB_BIN" >/dev/null 2>&1; then
            printf '%s\n' "$BDB_BIN"
            return 0
        fi
        return 1
    fi

    local candidate
    for candidate in bdb "$ROOT_DIR/Tools/bdb" "$HOME/Desktop/bdb"; do
        if command -v "$candidate" >/dev/null 2>&1; then
            command -v "$candidate"
            return 0
        fi
        if [ -x "$candidate" ]; then
            printf '%s\n' "$candidate"
            return 0
        fi
    done

    return 1
}

run_bdb() {
    local bdb
    if ! bdb="$(resolve_bdb)"; then
        printf 'Error: bdb was requested but was not found. Set BDB_BIN or install bdb on PATH.\n' >&2
        exit 1
    fi
    "$bdb" "$@"
}

while [ "$#" -gt 0 ]; do
    case "$1" in
        --install)
            INSTALL=1
            shift
            ;;
        --launch)
            INSTALL=1
            LAUNCH=1
            shift
            ;;
        --status)
            STATUS=1
            shift
            ;;
        --skip-web-build)
            BUILD_WEB=0
            shift
            ;;
        --web-target)
            [ "${2:-}" != "" ] || die "--web-target requires web or raw"
            WEB_TARGET="$2"
            shift 2
            ;;
        -h|--help)
            usage
            exit 0
            ;;
        *)
            die "unknown argument: $1"
            ;;
    esac
done

case "$WEB_TARGET" in
    web|raw) ;;
    *) die "--web-target must be web or raw" ;;
esac

if [ "$WEB_TARGET" = "raw" ]; then
    BUILD_WEB=0
fi

if [ "$STATUS" -eq 1 ]; then
    run_bdb status
fi

if [ "$BUILD_WEB" -eq 1 ]; then
    if [ ! -d "$ROOT_DIR/web/node_modules" ]; then
        printf 'Installing web dependencies...\n'
        (cd "$ROOT_DIR/web" && npm install --include=dev)
    fi
    (cd "$ROOT_DIR/web" && npm run build)
fi

gradle_args=(assembleDebug)
if [ "$WEB_TARGET" = "raw" ]; then
    gradle_args+=("-Pweb=raw")
fi

(cd "$ROOT_DIR/android" && ./gradlew "${gradle_args[@]}")

mkdir -p "$(dirname "$OUTPUT_APK")"
cp "$ROOT_DIR/android/app/build/outputs/apk/debug/app-debug.apk" "$OUTPUT_APK"
printf 'Copied APK: %s\n' "$OUTPUT_REL"

if [ "$INSTALL" -eq 1 ]; then
    run_bdb install "$OUTPUT_APK"
fi

if [ "$LAUNCH" -eq 1 ]; then
    run_bdb launch "$PACKAGE_ID"
fi
