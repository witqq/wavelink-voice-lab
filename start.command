#!/bin/sh
set -eu
cd "$(dirname "$0")"
if [ ! -d node_modules/ws ]; then
  npm install --omit=dev
fi
exec node server.mjs
