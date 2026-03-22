#!/bin/bash
# Auto-install GitHub CLI in Claude Code remote (web) environments.
# Skips entirely when running locally.

if [ "$CLAUDE_CODE_REMOTE" != "true" ]; then
  exit 0
fi

set -e

# Configure git identity if not already set
if ! git config user.name &>/dev/null; then
  git config --global user.name "Claude Code"
  git config --global user.email "claude@users.noreply.github.com"
  echo "Configured git identity: Claude Code"
fi

if command -v gh &>/dev/null; then
  exit 0
fi

GH_VERSION="2.65.0"
INSTALL_DIR="$HOME/.local/bin"
mkdir -p "$INSTALL_DIR"

ARCH=$(uname -m)
case "$ARCH" in
  x86_64)  ARCH="amd64" ;;
  aarch64) ARCH="arm64" ;;
  *)
    echo "Unsupported architecture: $ARCH" >&2
    exit 1
    ;;
esac

TARBALL="gh_${GH_VERSION}_linux_${ARCH}.tar.gz"
URL="https://github.com/cli/cli/releases/download/v${GH_VERSION}/${TARBALL}"

echo "Installing gh ${GH_VERSION} (${ARCH})..."
if ! curl -fsSL "$URL" -o "/tmp/${TARBALL}"; then
  echo "Failed to download gh from $URL" >&2
  exit 1
fi
tar -xzf "/tmp/${TARBALL}" -C /tmp
cp "/tmp/gh_${GH_VERSION}_linux_${ARCH}/bin/gh" "$INSTALL_DIR/gh"
chmod +x "$INSTALL_DIR/gh"
rm -rf "/tmp/${TARBALL}" "/tmp/gh_${GH_VERSION}_linux_${ARCH}"

# Make gh available for the rest of this session
if [ -n "$CLAUDE_ENV_FILE" ] && ! grep -q "$INSTALL_DIR" "$CLAUDE_ENV_FILE" 2>/dev/null; then
  echo "PATH=$INSTALL_DIR:\$PATH" >> "$CLAUDE_ENV_FILE"
fi

echo "gh $(gh --version | head -1) installed to $INSTALL_DIR"
