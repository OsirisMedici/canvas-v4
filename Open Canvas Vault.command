#!/bin/zsh
cd "$(dirname "$0")" || exit 1
/opt/homebrew/bin/node scripts/launch.mjs
read -k 1 "?Press any key to close this window."
