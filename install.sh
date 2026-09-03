#!/usr/bin/env sh
set -eu

if ! command -v node >/dev/null 2>&1; then
  echo "FlowPilot needs Node.js 20 or newer. Install it from https://nodejs.org/" >&2
  exit 1
fi

node -e 'const major=Number(process.versions.node.split(".")[0]); if (major < 20) { console.error("FlowPilot needs Node.js 20 or newer."); process.exit(1); }'
printf '%s\n' 'Installing dependencies...'
npm ci
npm run build
printf '\n%s\n' 'FlowPilot is ready. Start it with: npm start'
