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

# --- CocoaPods via Homebrew ---
# Not bundler: the Cloud image's system Ruby is 2.6, and activesupport 6.1
# (pulled by the Gemfile) crashes there with
# "uninitialized constant ActiveSupport::LoggerThreadSafeLevel::Logger".
# Homebrew's cocoapods ships its own modern Ruby and avoids that.
export HOMEBREW_NO_INSTALL_CLEANUP=TRUE
brew install cocoapods
cd ios
# The Podfile teaches xcodeproj the Xcode 16 objectVersion-70 mapping before the Pods
# project is generated, so `pod install` works here the same as locally.
pod install
