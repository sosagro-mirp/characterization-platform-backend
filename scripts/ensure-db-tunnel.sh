#!/usr/bin/env bash
set -euo pipefail

LOCAL_PORT=5433
REMOTE_HOST=mirp-lab
REMOTE_PORT=5432

if lsof -iTCP:"$LOCAL_PORT" -sTCP:LISTEN >/dev/null 2>&1; then
  echo "[db-tunnel] ya activo en localhost:$LOCAL_PORT"
  exit 0
fi

echo "[db-tunnel] abriendo túnel SSH hacia $REMOTE_HOST (localhost:$LOCAL_PORT -> $REMOTE_HOST:$REMOTE_PORT)..."
ssh -fN -L "$LOCAL_PORT":localhost:"$REMOTE_PORT" "$REMOTE_HOST" -o ExitOnForwardFailure=yes -o ConnectTimeout=10

for _ in $(seq 1 10); do
  if lsof -iTCP:"$LOCAL_PORT" -sTCP:LISTEN >/dev/null 2>&1; then
    echo "[db-tunnel] listo"
    exit 0
  fi
  sleep 0.5
done

echo "[db-tunnel] ERROR: el túnel no levantó a tiempo" >&2
exit 1
