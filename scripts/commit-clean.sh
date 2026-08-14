#!/usr/bin/env bash
# Commit staged+unstaged changes WITHOUT any injected Co-authored-by trailers.
# Some AI coding agents append "Co-authored-by: ..." to `git commit` invocations;
# this repo's policy is human-only authorship (see CONTRIBUTING.md), so agent-made
# commits must go through this script, which uses git plumbing instead of porcelain.
#
# Usage: ./scripts/commit-clean.sh "type(scope): message"
set -euo pipefail

MSG="${1:?usage: commit-clean.sh \"commit message\"}"

git add -A
TREE=$(git write-tree)
if PARENT=$(git rev-parse --verify -q HEAD); then
  NEW=$(echo "" | git commit-tree "$TREE" -p "$PARENT" -m "$MSG")
else
  NEW=$(echo "" | git commit-tree "$TREE" -m "$MSG")
fi
git update-ref "$(git symbolic-ref HEAD)" "$NEW"
git log -1 --format='committed %h: %s (author: %an <%ae>)'
