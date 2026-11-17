#!/usr/bin/env bash
# Pulls new commits from GitHub and restarts the bot, but only when:
#   - main moved on GitHub,
#   - the local checkout has no edits and can fast-forward,
#   - dependencies install and the tests pass.
# Otherwise the running bot is left alone. Every run logs to journalctl:
#   journalctl -u guild-tracker-update -n 50
#
# Run as root by guild-tracker-update.service; git and npm run as APP_USER.
# The whole script is a function so a pull that changes this file can't
# change it mid-run.

main() {
  set -euo pipefail
  local app_dir="${APP_DIR:-/home/josh/guild-tracker}"
  local app_user="${APP_USER:-josh}"
  local service="${SERVICE:-guild-tracker}"
  local branch="${BRANCH:-main}"
  [ -n "${NODE_BIN_DIR:-}" ] && export PATH="$NODE_BIN_DIR:$PATH"

  as_user() { runuser -u "$app_user" -- env PATH="$PATH" HOME="$(getent passwd "$app_user" | cut -d: -f6)" "$@"; }

  cd "$app_dir"
  as_user git fetch --quiet origin "$branch"
  local current remote
  current="$(as_user git rev-parse HEAD)"
  remote="$(as_user git rev-parse "origin/$branch")"
  [ "$current" = "$remote" ] && exit 0

  # A commit whose tests failed is skipped until a newer one arrives.
  if [ -f .deploy-failed ] && [ "$(cat .deploy-failed)" = "$remote" ]; then exit 0; fi

  if [ -n "$(as_user git status --porcelain --untracked-files=no)" ]; then
    echo "Local edits in $app_dir; not updating. Commit or discard them first."
    exit 1
  fi
  if ! as_user git merge-base --is-ancestor HEAD "origin/$branch"; then
    echo "Local commits that aren't on GitHub; not updating (fast-forward only)."
    exit 1
  fi

  echo "Updating ${current:0:7} -> ${remote:0:7}"
  as_user git merge --ff-only --quiet "origin/$branch"

  if as_user npm install --omit=dev --no-audit --no-fund --loglevel=error && as_user npm test --silent >/tmp/guild-tracker-test.log 2>&1; then
    rm -f .deploy-failed
    systemctl restart "$service"
    echo "Restarted $service on ${remote:0:7}."
  else
    echo "Install or tests failed on ${remote:0:7}; rolling back to ${current:0:7}. Test output:"
    tail -n 40 /tmp/guild-tracker-test.log 2>/dev/null || true
    as_user git reset --quiet --hard "$current"
    as_user npm install --omit=dev --no-audit --no-fund --loglevel=error || true
    echo "$remote" > .deploy-failed
    chown "$app_user" .deploy-failed
    exit 1
  fi
}

main "$@"
exit
