#!/bin/zsh
cd "$(dirname "$0")" || exit 1
/opt/homebrew/bin/node scripts/stop-local.mjs
read -k 1 "?Osiris Vault stopped. Press any key to close this window."
