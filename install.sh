#!/bin/bash

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "Uninstalling old versions..."
npm uninstall -g feishu-bridge fclaude 2>/dev/null || true

echo "Building packages..."
cd "$SCRIPT_DIR"
pnpm build

echo "Installing to global..."
npm install -g "$SCRIPT_DIR/packages/bridge" "$SCRIPT_DIR/packages/cli-client"

echo "Done!"
feishu-bridge --version
fclaude --version
