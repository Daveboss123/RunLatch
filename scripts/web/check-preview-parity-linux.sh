#!/bin/sh
set -eu
ROOT="$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)"
export PATH="$HOME/.cargo/bin:$PATH"
WORK="$(mktemp -d "$HOME/.cache/runlatch-ui-parity-XXXXXX")"
rustc --edition=2024 -D warnings "$ROOT/scripts/web/gate-preview-parity.rs" -o "$WORK/gate-parity"
"$WORK/gate-parity"
# Only the two artifacts made by this invocation, never shared backend outputs.
rm "$WORK/gate-parity"
rmdir "$WORK"
