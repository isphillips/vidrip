#!/bin/sh
# Xcode Cloud runs this immediately after cloning the repo, before resolving
# dependencies and building. It installs the JS + CocoaPods deps that Xcode
# Cloud does not handle for React Native projects.
set -e
set -x

# Repo root (Xcode Cloud sets this to the primary checkout path).
cd "$CI_PRIMARY_REPOSITORY_PATH"

# --- Node 22 (project requires it; RN 0.76 + CLI need >= the engines range) ---
brew install node@22
export PATH="$(brew --prefix node@22)/bin:$PATH"
node -v

# --- Yarn (berry, pinned in package.json) via corepack ---
corepack enable
corepack prepare yarn@3.6.4 --activate

# JS deps. postinstall runs patch-package (applies patches/*.patch).
yarn install --immutable

# Point the RN "Bundle React Native code and images" build phase at this node.
# .xcode.env.local is gitignored, so it must be written per-build.
echo "export NODE_BINARY=$(command -v node)" > "$CI_PRIMARY_REPOSITORY_PATH/ios/.xcode.env.local"

# --- CocoaPods via bundler (Gemfile pins a known-good version) ---
cd ios
bundle install
bundle exec pod install
