# Deploying to the droplet

A push to `main` (a direct push or a merged pull request) deploys the app. You can also run the workflow by hand: Actions → Deploy → Run workflow.

The workflow SSHes into the server and runs [`scripts/deploy.sh`](scripts/deploy.sh). That script pulls `main` in `/root/ds-attendance-platform` and rebuilds only the Compose service named `app`:

```bash
docker compose up -d --no-deps --build app
```

The image build installs dependencies and builds Next.js (`npm ci`, `prisma generate`, `next build` in the Dockerfile). The host does not run `npm install`. After the app is up, dangling images from the rebuild are pruned. Volumes stay as they are.

The MySQL database and the Caddy proxy are left untouched. Their containers keep running, and their volumes stay as they are. The script records every other running container and fails if one of them was stopped or replaced.

Docker layer cache is reused. If a deploy ever runs old code, replace that `docker compose up` line in `scripts/deploy.sh` with `docker compose build --no-cache app` and then `docker compose up -d --no-deps app`.

The interactive `deploy.sh` at the repo root is first-time setup. Automated deploys use `scripts/deploy.sh`.

A second push while a deploy is running waits in a queue. It pulls the latest `main` when it starts, so an in-progress image build is not killed halfway.

## GitHub Actions secrets

In the repo: **Settings → Secrets and variables → Actions → New repository secret**.

| Secret | Value |
| --- | --- |
| `DEPLOY_HOST` | `138.197.150.52` |
| `DEPLOY_USER` | `root` |
| `DEPLOY_PORT` | `22` (optional; the workflow uses 22 when this secret is omitted) |
| `DEPLOY_SSH_KEY` | Private half of a dedicated deploy key (full file, including the `BEGIN` and `END` lines) |

## Dedicated deploy key

Create a new key on your laptop. Do not reuse a personal SSH key. Revoking this key is one line in `/root/.ssh/authorized_keys`.

```bash
ssh-keygen -t ed25519 -C "github-actions-deploy" -f ~/ds-attendance-deploy -N ""
```

Append the public key on the server (this uses your existing personal login once):

```bash
ssh root@138.197.150.52 'mkdir -p /root/.ssh && chmod 700 /root/.ssh'
cat ~/ds-attendance-deploy.pub | ssh root@138.197.150.52 'cat >> /root/.ssh/authorized_keys && chmod 600 /root/.ssh/authorized_keys'
```

Paste the private key into the `DEPLOY_SSH_KEY` secret. Keep the line breaks.

```bash
cat ~/ds-attendance-deploy
```

Copy the whole output from `BEGIN OPENSSH PRIVATE KEY` through `END OPENSSH PRIVATE KEY`.

Each deploy records the server host key with `ssh-keyscan` and then connects with `StrictHostKeyChecking=yes`. If a firewall limits SSH to your home IP, allow GitHub-hosted runners to reach port 22 as well, or the job cannot connect.

## Server git remote

The checkout at `/root/ds-attendance-platform` has to `git pull` without a prompt. This repository is public, so HTTPS works with no credentials:

```bash
cd /root/ds-attendance-platform
git remote -v
git remote set-url origin https://github.com/AZK65/ds-attendance-platform.git
git pull --ff-only origin main
```

`.env` in that directory is not in git. Deploys do not create or overwrite it. It has to already be there; Compose reads the app's runtime secrets from it.

## Assistant API token

The read-only assistant API (`GET /api/assistant/...` on `https://qazidrivingschool.ca`) checks `Authorization: Bearer <token>` against `ASSISTANT_API_TOKEN`. Until that variable is set, every assistant route returns 503. The token is not accepted in the query string.

On the server, add it to the existing env file. Do not commit the value.

```bash
cd /root/ds-attendance-platform
openssl rand -hex 32
```

Open `.env` and add one line, using the hex string you just generated:

```bash
ASSISTANT_API_TOKEN=paste-the-hex-string-here
```

Then rebuild only the `app` service so Compose passes the variable into the container:

```bash
cd /root/ds-attendance-platform
docker compose up -d --no-deps --build app
```

A normal deploy does the same rebuild after `git pull`. If the token is added after that deploy has already finished, run the `docker compose` command above once so the running container picks it up. Check with:

```bash
curl -sS -o /dev/null -w '%{http_code}\n' https://qazidrivingschool.ca/api/assistant/summary
```

That request has no token, so the answer is `401` once the variable is set and `503` while it is still empty.
