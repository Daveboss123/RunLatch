#!/bin/sh
# User-local Linux tooling for supported NEAR Sandbox tests. No wallet keys.
set -eu

setup="$HOME/.cache/runlatch-setup"
mkdir -p "$setup"
cd "$setup"

if [ ! -x "$HOME/.cargo/bin/rustup" ]; then
    source=https://static.rust-lang.org/rustup/dist/x86_64-unknown-linux-gnu/rustup-init
    curl --proto '=https' --tlsv1.2 -fsS "$source" -o rustup-init
    curl --proto '=https' --tlsv1.2 -fsS "$source.sha256" -o rustup-init.sha256
    expected=$(awk '{print $1}' rustup-init.sha256)
    actual=$(sha256sum rustup-init | awk '{print $1}')
    if [ "$expected" != "$actual" ]; then
        echo 'Official rustup-init checksum mismatch; refusing execution.' >&2
        exit 1
    fi
    chmod 700 rustup-init
    ./rustup-init -y --no-modify-path --profile minimal \
        --default-toolchain 1.99.0 --component rustfmt,clippy \
        --target wasm32-unknown-unknown
fi

"$HOME/.cargo/bin/rustc" --version
"$HOME/.cargo/bin/cargo" --version
"$HOME/.cargo/bin/rustup" target list --installed
