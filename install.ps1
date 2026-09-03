$ErrorActionPreference = 'Stop'

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  throw 'FlowPilot needs Node.js 20 or newer. Install it from https://nodejs.org/'
}

$major = [int](node -p "process.versions.node.split('.')[0]")
if ($major -lt 20) { throw 'FlowPilot needs Node.js 20 or newer.' }

Write-Host 'Installing dependencies...'
npm ci
npm run build
Write-Host "`nFlowPilot is ready. Start it with: npm start"
