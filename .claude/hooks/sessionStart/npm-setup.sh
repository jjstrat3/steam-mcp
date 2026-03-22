#!/bin/bash
# Auto-install npm dependencies in Claude Code remote (web) environments.
# Skips entirely when running locally.

if [ "$CLAUDE_CODE_REMOTE" != "true" ]; then
  exit 0
fi

if [ -d "node_modules" ]; then
  exit 0
fi

set -e

echo "Installing npm dependencies..."
npm ci --ignore-scripts
echo "npm dependencies installed"
