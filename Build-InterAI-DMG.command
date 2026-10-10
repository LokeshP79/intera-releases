#!/bin/bash
set -e
cd "$(dirname "$0")"
npm install
npm test
npm run dist:mac
open dist
