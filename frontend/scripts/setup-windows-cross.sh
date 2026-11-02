#!/usr/bin/env bash
# One-time setup for building the Windows .exe installer from Debian/Ubuntu/WSL.
set -euo pipefail

sudo apt-get update
sudo apt-get install -y nsis clang lld llvm
rustup target add x86_64-pc-windows-msvc
cargo install --locked cargo-xwin
echo "Done. Build with: npm run build:windows"
