#!/usr/bin/env bash
# Pull main and rebuild only the Compose "app" service.
#
# Production on the droplet is Docker Compose in /root/ds-attendance-platform.
# docker-compose.yml defines:
#   app   — Next.js image. The Dockerfile runs npm ci, prisma generate, and
#           next build. The container runs prisma db push and next start.
#   caddy — reverse proxy image. It is not built or recreated here.
# MySQL is a different container, attached via the external network
# drivingschoolapi_default. It is not a service in this compose file.
#
# Caddy, MySQL, and every volume stay as they are. .github/workflows/deploy.yml
# SSHes in and runs this script. It is also safe to run on the server:
#   bash /root/ds-attendance-platform/scripts/deploy.sh
set -euo pipefail

APP_DIR="${APP_DIR:-/root/ds-attendance-platform}"
BRANCH="${BRANCH:-main}"
# Compose service to rebuild. Leave this as "app".
APP_SERVICE="${APP_SERVICE:-app}"
# Seconds to wait after start before checking the app container is still up.
STARTUP_WAIT="${STARTUP_WAIT:-8}"

# Used by the update string below (shellcheck cannot see inside the quoted heredoc).
# shellcheck disable=SC2034
script_path="$(readlink -f -- "$0" 2>/dev/null || realpath -- "$0")"

# Git pull rewrites this file. Keep the pull and the re-exec in one string
# that is fully read before any git command runs, then exec the checked-out
# copy so the Docker steps below are the version from that commit.
if [[ "${DEPLOY_REEXEC:-}" != 1 ]]; then
  update_cmd="$(cat <<'EOS'
set -euo pipefail
cd "$APP_DIR"
export GIT_TERMINAL_PROMPT=0

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "ERROR: ${APP_DIR} is not a git checkout." >&2
  exit 1
fi

# Tracked local edits would ship a mix of main and server changes.
# Ignored files such as .env are left alone.
if [[ -n "$(git status --porcelain --untracked-files=no)" ]]; then
  echo "ERROR: tracked files have local changes in ${APP_DIR}." >&2
  git status --short --untracked-files=no >&2
  exit 1
fi

remote="$(git remote get-url origin)"
case "$remote" in
  *://*:*@*) echo "==> Fetching origin/${BRANCH} (authenticated remote URL hidden)" ;;
  *) echo "==> Fetching ${remote} ${BRANCH}" ;;
esac

git fetch origin "$BRANCH"
git checkout "$BRANCH"
git pull --ff-only origin "$BRANCH"

echo "==> Checked out $(git rev-parse --short HEAD); running that version of the deploy script"
exec bash "$script_path"
EOS
)"
  export DEPLOY_REEXEC=1
  eval "$update_cmd"
  echo "ERROR: deploy script did not re-exec after pulling." >&2
  exit 1
fi

cd "$APP_DIR"

if ! docker compose version >/dev/null 2>&1; then
  echo "ERROR: docker compose is not available." >&2
  exit 1
fi

if [[ ! -f .env ]]; then
  echo "ERROR: ${APP_DIR}/.env is missing. Compose reads runtime secrets from it." >&2
  echo "Deploys do not create or overwrite .env." >&2
  exit 1
fi

if ! docker network inspect drivingschoolapi_default >/dev/null 2>&1; then
  echo "ERROR: Docker network drivingschoolapi_default is missing." >&2
  echo "The app service joins that network to reach MySQL. Start the stack that owns it, then deploy again." >&2
  exit 1
fi

# Remember every running container except the app. After the update, each
# of those container ids must still be running, so a mistake that recreates
# Caddy or MySQL fails the deploy.
ids_file="$(mktemp)"
preserve_file="$(mktemp)"
trap 'rm -f "$ids_file" "$preserve_file"' EXIT

app_full=""
app_cid="$(docker compose ps -q "$APP_SERVICE" 2>/dev/null || true)"
if [[ -n "$app_cid" ]]; then
  app_full="$(docker inspect -f '{{.Id}}' "$app_cid")"
fi

docker ps -q > "$ids_file"
while read -r id; do
  [[ -z "$id" ]] && continue
  full="$(docker inspect -f '{{.Id}}' "$id")"
  name="$(docker inspect -f '{{.Name}}' "$id")"
  if [[ -n "$app_full" && "$full" == "$app_full" ]]; then
    continue
  fi
  printf '%s %s\n' "$full" "$name" >> "$preserve_file"
done < "$ids_file"

echo "==> Containers left running through this deploy:"
if [[ -s "$preserve_file" ]]; then
  while read -r _full name; do
    echo "    ${name}"
  done < "$preserve_file"
else
  echo "    (none besides ${APP_SERVICE})"
fi

export BUILDKIT_PROGRESS=plain
export COMPOSE_ANSI=never

echo "==> Building and restarting Compose service '${APP_SERVICE}'"
# --no-deps keeps Caddy (depends_on: app) and MySQL out of this update.
# Volumes are left in place. Layer cache is reused. If a deploy ever ships
# a stale image, replace the next line with:
#   docker compose build --no-cache "$APP_SERVICE"
#   docker compose up -d --no-deps "$APP_SERVICE"
docker compose up -d --no-deps --build "$APP_SERVICE"

echo "==> Removing dangling images left by the rebuild"
# Dangling images only. Images in use, stopped containers, and volumes stay.
docker image prune -f

echo "==> Checking containers that were already running"
while read -r full name; do
  [[ -z "${full:-}" ]] && continue
  state="$(docker inspect -f '{{.State.Running}}' "$full" 2>/dev/null || echo missing)"
  if [[ "$state" != "true" ]]; then
    echo "ERROR: ${name} (${full}) was running before the deploy and is not running now." >&2
    echo "Deploys must only replace the ${APP_SERVICE} service." >&2
    exit 1
  fi
done < "$preserve_file"

echo "==> Waiting for ${APP_SERVICE} to stay up"
sleep "$STARTUP_WAIT"

new_cid="$(docker compose ps -q "$APP_SERVICE" || true)"
if [[ -z "$new_cid" ]]; then
  echo "ERROR: ${APP_SERVICE} has no running container." >&2
  docker compose ps -a "$APP_SERVICE" >&2 || true
  docker compose logs --tail=80 "$APP_SERVICE" >&2 || true
  exit 1
fi

status="$(docker inspect -f '{{.State.Status}}' "$new_cid")"
if [[ "$status" != "running" ]]; then
  echo "ERROR: ${APP_SERVICE} container status is '${status}'." >&2
  docker compose logs --tail=80 "$APP_SERVICE" >&2 || true
  exit 1
fi

echo "==> ${APP_SERVICE} is running"
docker compose ps "$APP_SERVICE"
echo "==> Deployed $(git rev-parse --short HEAD) ($(git log -1 --format=%s))"
