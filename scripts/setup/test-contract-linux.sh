#!/bin/sh
# Compile Linux binaries from source; never run the Windows-blocked executable.
set -eu
root=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)
export PATH="$HOME/.cargo/bin:/usr/bin:/bin:$PATH"
export CARGO_TARGET_DIR="$HOME/.cache/runlatch-target"
export CARGO_BUILD_JOBS=2
cd "$root"
cargo test --locked --manifest-path contracts/runlatch/Cargo.toml
cargo clippy --locked --all-targets --manifest-path contracts/runlatch/Cargo.toml -- -D warnings
cargo fmt --manifest-path contracts/runlatch/Cargo.toml -- --check
