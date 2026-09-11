#!/usr/bin/env bash
set -euo pipefail

DIST_DIR="${1:-dist}"
ARCHIVE_NAME="${2:-extension.zip}"
BROWSER="${3:-chrome}"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
DIST_DIR_ABS="$(mkdir -p "${DIST_DIR}" && cd "${DIST_DIR}" && pwd)"
PACKAGE_DIR="${DIST_DIR_ABS}/package-${BROWSER}"

create_zip() {
  local target_zip="$1"
  rm -f "${target_zip}"
  if command -v zip >/dev/null 2>&1; then
    zip -qr "${target_zip}" .
  elif command -v powershell.exe >/dev/null 2>&1; then
    powershell.exe -NoProfile -Command "Compress-Archive -Path * -DestinationPath '${target_zip}' -Force"
  elif command -v powershell >/dev/null 2>&1; then
    powershell -NoProfile -Command "Compress-Archive -Path * -DestinationPath '${target_zip}' -Force"
  else
    echo "zip command is required but not installed."
    exit 1
  fi
}

node "${REPO_ROOT}/apps/extension/build.mjs" "${BROWSER}"

rm -rf "${PACKAGE_DIR}"
mkdir -p "${PACKAGE_DIR}"
cp -R "${REPO_ROOT}/apps/extension/dist/${BROWSER}/." "${PACKAGE_DIR}/"

(
  cd "${PACKAGE_DIR}"
  find . -name '.DS_Store' -delete 2>/dev/null || true
  create_zip "../${ARCHIVE_NAME}"
)

rm -rf "${PACKAGE_DIR}"

echo "Built extension package: ${DIST_DIR}/${ARCHIVE_NAME}"
