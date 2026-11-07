#!/bin/sh
# Two distinctly labelled artifacts; no deploy or network signature.
set -eu
directory=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
sh "$directory/build-contract-linux.sh" production
sh "$directory/build-contract-linux.sh" callback-fault
