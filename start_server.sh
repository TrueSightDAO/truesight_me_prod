#!/usr/bin/env bash
set -euo pipefail

# Local static preview for the truesight_me site (serves repo root so paths like /styles/ and /whitepaper/ resolve).
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

PORT="${PORT:-8080}"
HOST="${HOST:-127.0.0.1}"

if ! command -v python3 >/dev/null 2>&1; then
  echo "python3 is required (for: python3 -m http.server)." >&2
  exit 1
fi

echo "Serving: ${ROOT}"
echo "Open:    http://${HOST}:${PORT}/"
echo "Stop:    Ctrl+C"
echo "(Set PORT=3000 or HOST=0.0.0.0 to override.)"
exec python3 -m http.server "$PORT" --bind "$HOST" --directory "$ROOT"
