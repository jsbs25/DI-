#!/usr/bin/env bash
set -e

# ==============================================================================
# EARTH ONE -> GitHub Synchronization Script
# Target Repository: https://github.com/jsbs25/DI-
# ==============================================================================

REPO_URL="https://github.com/jsbs25/DI-.git"
TARGET_BRANCH="main"

echo "========================================================"
echo "🌍 EARTH ONE - GitHub Repository Synchronization"
echo "Target: ${REPO_URL}"
echo "========================================================"

# Allow directory in git safe.directory list
git config --global --add safe.directory /app/applet 2>/dev/null || true
git config --global --add safe.directory "*" 2>/dev/null || true

# 1. Initialize Git repository if not present
if [ ! -d ".git" ]; then
  echo "📦 Initializing local Git repository..."
  git init
fi

git config user.name "EARTH ONE Engineer"
git config user.email "build@earthone.world"

# 2. Stage and commit all tracked project files
echo "📝 Checking working tree and staging files..."
git add -A

if git rev-parse --verify HEAD >/dev/null 2>&1; then
  if git diff-index --quiet HEAD -- 2>/dev/null; then
    echo "ℹ️  Working tree clean, no new changes to commit."
  else
    echo "💾 Creating synchronization commit..."
    git commit -m "feat(earth-one): complete planetary platform with 3D globe, universe engine & live feed"
  fi
else
  echo "💾 Creating initial project commit..."
  git commit -m "feat(earth-one): initial commit of complete global digital world platform"
fi

# Ensure default branch is main
git branch -M "${TARGET_BRANCH}"

# 3. Configure clean remote origin
if git remote | grep -q "^origin$"; then
  git remote set-url origin "${REPO_URL}"
else
  git remote add origin "${REPO_URL}"
fi

# 4. Check for GitHub Token
TOKEN="${1:-$GITHUB_TOKEN}"

# Normalize prefix if capitalized (e.g. Ghp_ -> ghp_)
if [[ "$TOKEN" =~ ^Ghp_ ]]; then
  TOKEN="ghp_${TOKEN#Ghp_}"
fi

if [ -z "$TOKEN" ]; then
  echo ""
  echo "========================================================"
  echo "✅ Local Git repository successfully created and committed!"
  echo "Current branch: $(git branch --show-current)"
  echo "Total commits: $(git rev-list --count HEAD)"
  echo "Remote origin: $(git remote get-url origin)"
  echo "========================================================"
  echo ""
  echo "🔑 TO COMPLETE PUSH TO YOUR GITHUB REPOSITORY:"
  echo "Run either of the following commands with your GitHub Personal Access Token:"
  echo ""
  echo "  export GITHUB_TOKEN=\"ghp_your_personal_access_token\""
  echo "  bash scripts/sync_to_github.sh"
  echo ""
  echo "Or:"
  echo "  bash scripts/sync_to_github.sh ghp_your_personal_access_token"
  echo ""
  echo "All project files have been safely committed locally."
  exit 0
fi

# 5. Push using token with automated cleanup trap
AUTHENTICATED_URL="https://x-access-token:${TOKEN}@github.com/jsbs25/DI-.git"

# Function to remove token from config upon exit
cleanup() {
  git remote set-url origin "${REPO_URL}" 2>/dev/null || true
  echo "🔒 Cleaned up remote credentials from local .git/config."
}
trap cleanup EXIT INT TERM

echo "🚀 Connecting to remote repository with GitHub Personal Access Token..."
git remote set-url origin "${AUTHENTICATED_URL}"

# Push to main
echo "⬆️  Pushing ${TARGET_BRANCH} branch to GitHub..."
git push -u origin "${TARGET_BRANCH}" --force

echo ""
echo "========================================================"
echo "🎉 SUCCESS: EARTH ONE codebase synchronized to:"
echo "👉 https://github.com/jsbs25/DI-"
echo "========================================================"
