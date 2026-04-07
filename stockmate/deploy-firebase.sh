#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

if [ -f ".env" ]; then
  set -a
  . ".env"
  set +a
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "Error: npm is not installed or not in PATH."
  exit 1
fi

if ! command -v firebase >/dev/null 2>&1; then
  echo "Error: firebase CLI is not installed or not in PATH."
  echo "Install it with: npm install -g firebase-tools"
  exit 1
fi

FIREBASE_PROJECT_ID="${FIREBASE_PROJECT_ID:-${VITE_FIREBASE_PROJECT_ID:-se-erp-4c7fe}}"
FIREBASE_SITE_ID="${FIREBASE_SITE_ID:-$FIREBASE_PROJECT_ID}"
FIREBASE_HOSTING_TARGET="${FIREBASE_HOSTING_TARGET:-app}"

echo "Building project..."
npm run build

echo "Applying hosting target ${FIREBASE_HOSTING_TARGET} -> ${FIREBASE_SITE_ID} on project ${FIREBASE_PROJECT_ID}..."
firebase target:apply hosting "$FIREBASE_HOSTING_TARGET" "$FIREBASE_SITE_ID" --project "$FIREBASE_PROJECT_ID"

echo "Deploying to Firebase..."
firebase deploy --project "$FIREBASE_PROJECT_ID" --only "hosting:$FIREBASE_HOSTING_TARGET"

echo "Deployment completed successfully."
