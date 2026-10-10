#!/bin/bash
set -e
cd "$(dirname "$0")"
if ! command -v npm >/dev/null 2>&1; then
  echo "Install Node.js 22 or newer, then open this file again."
  read -r -p "Press Return to close. "
  exit 1
fi
npm install
npm start
