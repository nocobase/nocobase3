#!/usr/bin/env bash
#
# Generates an application with create-app and boots it, which is the one thing the release pipeline could not tell
# you before: every package can build, typecheck and test in this repository and still produce an application that
# does not start, because what a generated application installs is decided by published manifests rather than by the
# workspace links everything resolves through here.
#
# The versions are given explicitly rather than resolved through a dist-tag. On a proxying registry a dist-tag is the
# higher of the local and the upstream value, so `latest` there is not the `latest` a user would get — and during a
# hotfix release, where the version being tested is deliberately older than the one upstream, it would resolve to a
# version this run never produced.
#
# Usage:
#   scripts/smoke-create-app.sh \
#     --registry http://localhost:4873 \
#     --create-app-version 0.1.0-beta.12 \
#     --template @nocobase/app-template-default@0.1.0-beta.12 \
#     [--dialect sqlite] [--workdir DIR] [--timeout SECONDS]

set -euo pipefail

REGISTRY=''
CREATE_APP_VERSION=''
TEMPLATE=''
DIALECT='sqlite'
WORKDIR=''
TIMEOUT=420
APP_NAME='crm'

while [ $# -gt 0 ]; do
  case "$1" in
    --registry) REGISTRY="$2"; shift 2 ;;
    --create-app-version) CREATE_APP_VERSION="$2"; shift 2 ;;
    --template) TEMPLATE="$2"; shift 2 ;;
    --dialect) DIALECT="$2"; shift 2 ;;
    --workdir) WORKDIR="$2"; shift 2 ;;
    --timeout) TIMEOUT="$2"; shift 2 ;;
    --app-name) APP_NAME="$2"; shift 2 ;;
    -h|--help) sed -n '2,22p' "$0"; exit 0 ;;
    *) echo "Unknown argument: $1" >&2; exit 2 ;;
  esac
done

if [ -z "$REGISTRY" ] || [ -z "$CREATE_APP_VERSION" ] || [ -z "$TEMPLATE" ]; then
  echo "::error::--registry, --create-app-version and --template are all required" >&2
  exit 2
fi

if [ -z "$WORKDIR" ]; then
  WORKDIR="$(mktemp -d)"
fi
mkdir -p "$WORKDIR"

APP_DIR="$WORKDIR/$APP_NAME"
DEV_LOG="$WORKDIR/dev.log"

# A freshly published version is minutes old, and pnpm refuses packages younger than the configured minimum release
# age. Both the create-app download and the generated application's own install have to see this.
export PNPM_CONFIG_MINIMUM_RELEASE_AGE=0
# Both spellings, because the two tools disagree about which one exists. pnpm 11 reads PNPM_CONFIG_<SETTING> and
# ignores npm_config_* entirely, while npm reads npm_config_* and knows nothing about the pnpm form. `pnpm create`
# resolves through pnpm, and create-app shells out to both, so setting only one silently leaves half of this pointed
# at whatever registry the machine is configured for.
export PNPM_CONFIG_REGISTRY="$REGISTRY"
export npm_config_registry="$REGISTRY"
export NPM_CONFIG_REGISTRY="$REGISTRY"
# create-app reads this when --registry is not given; passing both keeps the generated application's install pointed
# at the same place even if the flag handling changes.
export NOCOBASE_REGISTRY="$REGISTRY"

# An override that silently did not apply would test packages from the wrong registry and report success, so it is
# confirmed rather than assumed.
for tool in pnpm npm; do
  resolved="$("$tool" config get registry 2>/dev/null | tr -d '\r' | tail -1)"
  case "$resolved" in
    "$REGISTRY"|"$REGISTRY/") ;;
    *)
      echo "::error::$tool resolves the registry to '$resolved', not '$REGISTRY'" >&2
      exit 1
      ;;
  esac
done

echo "::group::Create the application"
echo "registry:    $REGISTRY"
echo "create-app:  $CREATE_APP_VERSION"
echo "template:    $TEMPLATE"
echo "dialect:     $DIALECT"
echo "workdir:     $WORKDIR"

cd "$WORKDIR"
rm -rf "$APP_DIR"

# --db-dialect is what keeps this non-interactive: it is the only question the app flow asks.
pnpm create "@nocobase/app@$CREATE_APP_VERSION" "$APP_NAME" \
  --db-dialect="$DIALECT" \
  --registry="$REGISTRY" \
  --template="$TEMPLATE"
echo "::endgroup::"

if [ ! -d "$APP_DIR/node_modules" ]; then
  echo "::error::create-app finished without installing dependencies into $APP_DIR"
  exit 1
fi

echo "::group::Boot the application with pnpm dev"
cd "$APP_DIR"

# `pnpm dev` does not exit on success — it holds the client and server processes open — so it runs in the background
# and is judged by what it prints. The template's dev entry only prints this line after both the Vite dev server and
# the application server's /api/healthz have answered, and it exits non-zero when either fails to come up or a child
# dies, so the two outcomes this loop watches for are the two the script actually has.
READY_MARKER='App dev server ready'

# Job control, so the background job becomes its own process group and the whole tree can be signalled at the end.
# Killing the pnpm process alone would leave vite and tsx running, and the job would hang waiting on them. `setsid`
# would do the same thing but does not exist on macOS, where this script is also run by hand.
set -m
pnpm dev > "$DEV_LOG" 2>&1 &
DEV_PID=$!
set +m

stop_dev() {
  if kill -0 "$DEV_PID" 2>/dev/null; then
    kill -TERM -"$DEV_PID" 2>/dev/null || kill -TERM "$DEV_PID" 2>/dev/null || true
    for _ in $(seq 1 20); do
      kill -0 "$DEV_PID" 2>/dev/null || break
      sleep 0.5
    done
    kill -KILL -"$DEV_PID" 2>/dev/null || true
  fi
}
trap stop_dev EXIT

READY=0
EXITED=0
for _ in $(seq 1 "$TIMEOUT"); do
  if grep -qF "$READY_MARKER" "$DEV_LOG" 2>/dev/null; then
    READY=1
    break
  fi
  if ! kill -0 "$DEV_PID" 2>/dev/null; then
    EXITED=1
    break
  fi
  sleep 1
done

if [ "$READY" != "1" ]; then
  echo "::endgroup::"
  if [ "$EXITED" = "1" ]; then
    echo "::error::pnpm dev exited before the application became ready"
  else
    echo "::error::pnpm dev did not become ready within ${TIMEOUT}s"
  fi
  echo "----- dev.log -----"
  cat "$DEV_LOG"
  exit 1
fi

# The readiness line is followed by the URL the application is served on, and the port is not fixed: the dev entry
# falls back to another one when its preferred port is taken. Reading it back is both how the URL is discovered and a
# check that the line means what it says.
APP_URL="$(grep -F 'Local:' "$DEV_LOG" | tail -1 | awk '{print $2}')"

if [ -z "$APP_URL" ]; then
  echo "::endgroup::"
  echo "::error::The application reported ready but printed no URL"
  cat "$DEV_LOG"
  exit 1
fi

echo "Application is serving at $APP_URL"

if ! curl -fsS --max-time 30 "$APP_URL" -o /dev/null; then
  echo "::endgroup::"
  echo "::error::$APP_URL did not answer after the application reported ready"
  cat "$DEV_LOG"
  exit 1
fi

echo "::endgroup::"
echo "create-app smoke test passed: $TEMPLATE booted on $DIALECT."
