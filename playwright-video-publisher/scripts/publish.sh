#!/bin/bash
set -euo pipefail
task_dir="$(cd "$(dirname "$0")" && pwd)"
task_node="${MEDIA_NODE_BIN:-}"
if [ -z "$task_node" ]; then
  task_node="$(command -v node || true)"
fi
if [ -z "$task_node" ]; then
  task_node="$HOME/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node"
fi
if [ ! -x "$task_node" ]; then
  echo 'Set MEDIA_NODE_BIN to an existing Node.js executable.' >&2
  exit 1
fi
unset NODE_OPTIONS
exec "$task_node" "$task_dir/publisher.cjs" "$@"
