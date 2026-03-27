#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

if ! command -v npm >/dev/null 2>&1; then
  echo "Error: npm is not installed or not in PATH."
  exit 1
fi

if ! command -v firebase >/dev/null 2>&1; then
  echo "Error: firebase CLI is not installed or not in PATH."
  echo "Install it with: npm install -g firebase-tools"
  exit 1
fi

echo "Building project..."
npm run build

echo "Deploying to Firebase..."
firebase deploy

echo "Deployment completed successfully."
