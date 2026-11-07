#!/bin/sh
# Official native Linux build tool, not a launcher for the blocked Windows file.
set -eu
version=0.22.0
archive_name=cargo-near-x86_64-unknown-linux-gnu.tar.gz
expected=9429064e30a427e96523f539cb255f3688d2345e5000d7d4e4873a8247247d1a
directory="$HOME/.local/share/runlatch/tools/cargo-near-$version"
mkdir -p "$directory"
archive="$directory/$archive_name"
url="https://github.com/near/cargo-near/releases/download/cargo-near-v$version"
if [ ! -f "$archive" ]; then
    curl --proto '=https' --tlsv1.2 --fail --silent --show-error --location \
        "$url/$archive_name" --output "$archive.download"
    actual=$(sha256sum "$archive.download" | cut -d ' ' -f 1)
    [ "$actual" = "$expected" ] || { echo 'Linux cargo-near checksum mismatch' >&2; exit 1; }
    mv "$archive.download" "$archive"
fi
actual=$(sha256sum "$archive" | cut -d ' ' -f 1)
[ "$actual" = "$expected" ] || { echo 'Existing Linux archive checksum mismatch; leaving it untouched' >&2; exit 1; }
tar -tzf "$archive" > "$directory/archive-members.txt"
while IFS= read -r member; do
    case "$member" in
        /*|*../*) echo 'Unsafe archive path' >&2; exit 1 ;;
        cargo-near-x86_64-unknown-linux-gnu|cargo-near-x86_64-unknown-linux-gnu/*) ;;
        *) echo 'Unexpected archive path' >&2; exit 1 ;;
    esac
done < "$directory/archive-members.txt"
binary="$directory/cargo-near-x86_64-unknown-linux-gnu/cargo-near"
if [ ! -f "$binary" ]; then
    tar --extract --gzip --file "$archive" --directory "$directory" --no-same-owner --no-same-permissions
fi
printf 'Verified Linux cargo-near archive SHA-256: %s\n' "$actual"
"$binary" --version
