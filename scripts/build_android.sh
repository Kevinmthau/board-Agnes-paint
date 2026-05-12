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

java_major() {
    local java_bin="${1:-java}"
    "$java_bin" -version 2>&1 | awk -F '"' '/version/ {
        split($2, parts, ".")
        if (parts[1] == "1") print parts[2]; else print parts[1]
        exit
    }'
}

javac_major() {
    local javac_bin="${1:-javac}"
    "$javac_bin" -version 2>&1 | awk '/javac/ {
        split($2, parts, ".")
        if (parts[1] == "1") print parts[2]; else print parts[1]
        exit
    }'
}

valid_jdk_home() {
    local java_home="$1"
    local detected_java_major detected_javac_major

    [ -n "$java_home" ] || return 1
    [ -x "$java_home/bin/java" ] || return 1
    [ -x "$java_home/bin/javac" ] || return 1

    detected_java_major="$(java_major "$java_home/bin/java")"
    detected_javac_major="$(javac_major "$java_home/bin/javac")"
    [[ "$detected_java_major" =~ ^[0-9]+$ && "$detected_java_major" -ge 17 ]] || return 1
    [[ "$detected_javac_major" =~ ^[0-9]+$ && "$detected_javac_major" -ge 17 ]] || return 1
}

detect_jdk_home() {
    local candidate

    if [ -n "${JAVA_HOME:-}" ] && valid_jdk_home "$JAVA_HOME"; then
        printf '%s\n' "$JAVA_HOME"
        return 0
    fi

    if [ -x /usr/libexec/java_home ]; then
        candidate="$(/usr/libexec/java_home -v 17 2>/dev/null || true)"
        if [ -n "$candidate" ] && valid_jdk_home "$candidate"; then
            printf '%s\n' "$candidate"
            return 0
        fi
    fi

    for candidate in \
        "/Applications/Android Studio.app/Contents/jbr/Contents/Home" \
        "$HOME/Applications/Android Studio.app/Contents/jbr/Contents/Home"; do
        if valid_jdk_home "$candidate"; then
            printf '%s\n' "$candidate"
            return 0
        fi
    done

    return 1
}

detect_android_sdk() {
    local candidate local_properties_sdk

    local_properties_sdk="$(awk -F= '/^[[:space:]]*sdk\.dir[[:space:]]*=/ {
        sub(/^[[:space:]]*sdk\.dir[[:space:]]*=[[:space:]]*/, "")
        sub(/[[:space:]]*$/, "")
        gsub(/\\ /, " ")
        print
        exit
    }' "$ROOT_DIR/android/local.properties" 2>/dev/null || true)"

    for candidate in "$local_properties_sdk" "${ANDROID_HOME:-}" "${ANDROID_SDK_ROOT:-}" "$HOME/Library/Android/sdk" "$HOME/Android/Sdk"; do
        if [ -n "$candidate" ] && [ -d "$candidate" ]; then
            printf '%s\n' "$candidate"
            return 0
        fi
    done
    return 1
}

configure_android_build_env() {
    local jdk_home sdk_dir path_java_major path_javac_major

    if jdk_home="$(detect_jdk_home)"; then
        if [ "${JAVA_HOME:-}" != "$jdk_home" ]; then
            printf 'Using JDK: %s\n' "$jdk_home"
        fi
        export JAVA_HOME="$jdk_home"
    else
        if [ -n "${JAVA_HOME:-}" ]; then
            die "JAVA_HOME is set but does not point to a JDK 17+ directory: $JAVA_HOME"
        fi
        if ! command -v java >/dev/null 2>&1 || ! command -v javac >/dev/null 2>&1; then
            die "JDK 17+ not found. Install one or set JAVA_HOME to a JDK 17+ directory."
        fi
        path_java_major="$(java_major)"
        path_javac_major="$(javac_major)"
        if ! [[ "$path_java_major" =~ ^[0-9]+$ && "$path_java_major" -ge 17 && "$path_javac_major" =~ ^[0-9]+$ && "$path_javac_major" -ge 17 ]]; then
            die "JDK 17+ not found. Install one or set JAVA_HOME to a JDK 17+ directory."
        fi
    fi

    if ! sdk_dir="$(detect_android_sdk)"; then
        die "Android SDK not found. Install it or set ANDROID_HOME or ANDROID_SDK_ROOT."
    fi
    if [ "${ANDROID_HOME:-}" != "$sdk_dir" ]; then
        printf 'Using Android SDK: %s\n' "$sdk_dir"
    fi
    export ANDROID_HOME="$sdk_dir"
    export ANDROID_SDK_ROOT="$sdk_dir"
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

configure_android_build_env

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
