# Common Ground Checker Backend

<p>
	<img src="./public/icons/Common_gound_logo_rgb.svg" alt="Common Ground" height="20" />
	<img src="./badges/coverage.svg" alt="Coverage" height="20" />
	<img src="./badges/vulnerabilities.svg" alt="Vulnerabilities" height="20" />
</p>

A Fastify-based backend for repository analysis, Common Ground compliance checking, and analysis result storage.

This repository provides the backend service for the Common Ground Checker application. It exposes REST APIs for repository metadata, analysis runs, scoring configuration, history retrieval, and CSV export.

## Overview

- **Runtime:** Node.js 22+
- **Server:** Fastify
- **Database:** PostgreSQL via Prisma
- **Language:** TypeScript
- **Tests:** Vitest

## Architecture

The backend is structured into the following layers:

- `src/server.ts` � Fastify application bootstrap and route registration
- `src/app/api/*` � API route modules that define request handling and response shaping
- `src/lib/db.ts` � Prisma client singleton and database connection
- `src/lib/github.ts` � GitHub REST API client used by checkers
- `prisma/schema.prisma` � database model definitions for repositories, analyses, and scoring configuration

## API

The API supports three types of resources:
- Repositories: metadata of repository that have been analysed at least once
- Repository Analyses: all analysis jobs that have been performed in te past.
- Scoring: the settings with wich scores have been calculated. Each repository analysis has a reference to a Scoring. 

### Supported endpoints

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/openapi` | Retrieve the OpenAPI specification |
| `GET` | `/api/repositories` | List known repositories and their latest summary |
| `GET` | `/api/repositories/export` | Export repository analysis history as CSV |
| `POST` | `/api/repositories` | Create or update repository metadata |
| `POST` | `/api/repositories/{repoId}/analyses` | Persist a new analysis result for an existing repository |
| `POST` | `/api/webhook` | Register a repository for scheduled rescans or trigger a rescan from CI |
| `PUT` | `/api/repositories/{repoId}/follow` | Follow or unfollow a repository for scheduled rescans (admin token required) |
| `GET` | `/api/admin/scoring` | Retrieve the current scoring configuration snapshot |
| `POST` | `/api/admin/scoring` | Save a new scoring configuration snapshot |
| `GET` | `/api/repo-history` | Retrieve analysis history for a repository by owner/repo |

### Request/response shape

- `/api/repositories` expects JSON metadata containing `repoUrl` and optional repository fields.
- The literal OpenAPI specification is stored in `src/app/api/openapi/openapi.yaml` and served by `/api/openapi`.
- `/api/repositories/{repoId}/analyses` expects analysis result payloads including `checkedAt`, `score`, and `results`.
- `/api/admin/scoring` exposes and persists custom scoring parameters for criterion weights, complexity thresholds, and Spectral ruleset selection.
- `/api/repositories/{repoId}/follow` expects `{ "followed": true, "checkIntervalHours": 168 }`. The interval is `24` (daily), `168` (weekly) or `720` (monthly); when omitted, the stored interval is kept, or weekly is used when following for the first time.

### Followed repositories

Each repository has follow settings, returned by `/api/repositories` and `/api/repo-history`:

- `followed`: whether the repository is rescanned on a schedule
- `checkIntervalHours`: hours between scheduled checks
- `lastCheckedAt`: when the latest analysis was stored
- `nextCheckAt`: when the repository is next due, recalculated whenever an analysis is stored or the follow settings change; `null` when not followed

### Scheduled rescans

When `SCHEDULER_ENABLED=true`, the backend rescans followed repositories that are due (`nextCheckAt` has passed). It does not run checks itself: it calls the checker frontend's `POST {CHECKER_URL}/api/check` with the repository URL and its stored options (the helm chart, documentation, docker and API specification locations, and `isRegister`), and the frontend stores the new analysis through this backend, which moves `nextCheckAt` on by the interval.

Before a scan starts, the repository is claimed in the database by moving `nextCheckAt` forward one interval, so a scan is never started twice, also not by a second backend instance. A failed scan is logged and retried at the next interval; it does not hold up other repositories.

| Variable | Default | Description |
|---|---|---|
| `SCHEDULER_ENABLED` | `false` | Set to `true` to run the scheduler in this process |
| `CHECKER_URL` | none, required | Base URL of the checker frontend, for example `http://localhost:3001`; without it the scheduler does not start |
| `SCHEDULER_TICK_SECONDS` | `60` | How often due repositories are looked up |
| `SCHEDULER_MAX_CONCURRENT` | `2` | Maximum number of scans running at once in this process |
| `SCHEDULER_SCAN_TIMEOUT_SECONDS` | `900` | A scan that takes longer is aborted and retried at the next interval |

The scheduler stops when the server closes (also on `SIGINT` and `SIGTERM`); scans still in flight are aborted and picked up again at their next interval.

`POST /api/repositories` accepts an optional boolean `isRegister`, stored with the repository and passed on to scheduled rescans.

### Rescan webhook

`POST /api/webhook` lets a repository register itself for scheduled rescans and trigger a rescan from its own CI, the same way from GitHub Actions, GitLab CI or any other git flow.

```json
{ "repoUrl": "https://github.com/owner/repo", "action": "register" | "rescan", "checkIntervalHours": 168, "options": { "helmChartLocations": ["charts/app"], "isRegister": false } }
```

- `register` needs `Authorization: Bearer <WEBHOOK_ADMIN_TOKEN>`. It follows the repository with the given interval (default weekly), stores `options` with it, queues an immediate rescan and returns a new **repository token**. The token is shown only in this response; the backend stores only its sha256 hash. Registering an existing repository again rotates the token. Without `WEBHOOK_ADMIN_TOKEN` registration is disabled (`503`).
- `rescan` needs `Authorization: Bearer <repository token>` (the admin token works too). It queues an immediate rescan through the scheduler.
- Both answer `202` with `repoId`, `status` (`queued` or `already queued`) and `nextCheckAt`. At most one rescan per repository is queued at a time: while one is waiting or running in this process, a further request answers `already queued`. An unknown repository gives `404`, a wrong token `401`. Tokens are compared in constant time.

Queued rescans are started by the scheduler, so `SCHEDULER_ENABLED=true` and `CHECKER_URL` must be set for a queued rescan to be picked up when the concurrency limit was reached at the time of the request.

Register once, for example:

```bash
curl -X POST https://checker-api.example.org/api/webhook \
  -H "Authorization: Bearer $WEBHOOK_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"repoUrl": "https://github.com/owner/repo", "action": "register", "checkIntervalHours": 168}'
```

Store the returned `token` as a secret in the repository (for example `CG_CHECKER_TOKEN`) and the backend URL as a variable (`CG_CHECKER_URL`).

GitHub Actions, `.github/workflows/common-ground-check.yml`:

```yaml
name: Common Ground check

on:
  push:
    branches: [main]
  release:
    types: [published]

jobs:
  rescan:
    runs-on: ubuntu-latest
    steps:
      - name: Trigger a Common Ground Checker rescan
        env:
          CG_CHECKER_URL: ${{ vars.CG_CHECKER_URL }}
          CG_CHECKER_TOKEN: ${{ secrets.CG_CHECKER_TOKEN }}
        run: |
          curl --fail-with-body -sS -X POST "$CG_CHECKER_URL/api/webhook" \
            -H "Authorization: Bearer $CG_CHECKER_TOKEN" \
            -H "Content-Type: application/json" \
            -d "{\"repoUrl\": \"${{ github.server_url }}/${{ github.repository }}\", \"action\": \"rescan\"}"
```

Replace `main` with the repository's default branch. GitLab CI, in `.gitlab-ci.yml`, with `CG_CHECKER_URL` and a masked `CG_CHECKER_TOKEN` as CI/CD variables:

```yaml
common-ground-rescan:
  stage: deploy
  image: curlimages/curl:8.10.1
  rules:
    - if: $CI_COMMIT_BRANCH == $CI_DEFAULT_BRANCH
    - if: $CI_COMMIT_TAG
  script:
    - >
      curl --fail-with-body -sS -X POST "$CG_CHECKER_URL/api/webhook"
      -H "Authorization: Bearer $CG_CHECKER_TOKEN"
      -H "Content-Type: application/json"
      -d "{\"repoUrl\": \"$CI_PROJECT_URL\", \"action\": \"rescan\"}"
```

The `repoUrl` must match the URL the repository was registered with.

### Admin access

Changing follow settings requires `Authorization: Bearer <ADMIN_TOKEN>`, where `ADMIN_TOKEN` is an environment variable of the backend. Without `ADMIN_TOKEN` the follow route is disabled and answers `503`. The token is compared in constant time.

## Database

The service uses PostgreSQL as its primary datastore. Prisma is used for type-safe database access and schema migrations.

### Primary models

- `Repo` � stores repository metadata, GitHub owner/name, repository URL, topics, license, and discovered locations.
- `RepoAnalysis` � stores analysis run results, score, checked timestamp, version information, and raw results payload.
- `ScoringConfig` � stores a snapshot of scoring configuration used for a run, including criterion weights and thresholds.

The Prisma schema is defined in `prisma/schema.prisma`. Generated Prisma client code is located in `src/generated/prisma`.

## Setup

1. Install dependencies:

```bash
npm install
```

2. Start Postgres for local development:

```bash
docker compose up -d db
```

3. Copy the environment file and configure values:

```bash
copy .env.example .env
```

Edit `.env` and set `DATABASE_URL`, `GITHUB_TOKEN` (optional), and any other required values.

4. Push the Prisma schema and generate the client:

```bash
npm run db:push
npm run db:generate
```

5. Run the service locally:

```bash
npm run dev
```

The backend will start on port `3000` by default.

## Running

- Development server: `npm run dev`
- Production-like start: `npm run start`
- TypeScript build check: `npm run build`
- Tests: `npm test`
- Watch tests: `npm run test:watch`

## Docker Compose

Start the database and the API server together using Docker Compose:

```bash
docker compose up -d --build
```

This will:

- build the API image
- start the `db` service with Postgres
- start the `api` service connected to the database

To stop the services without removing data:

```bash
docker compose down
```

To remove containers and network but keep the database volume:

```bash
docker compose down
```

To remove the database data as well, use:

```bash
docker compose down -v
```

## Testing

The backend includes unit and integration tests using Vitest.

```bash
npm test
```

## Notes

- The GitHub token is optional but highly recommended. Without it, the GitHub API rate limit is 60 requests per hour.
- The backend exposes an OpenAPI JSON document at `/api/openapi`.
- The CSV export endpoint is available at `/api/repositories/export`.

## License

This project is licensed under the EUPL-1.2 license.

(C) VNG Realisatie

Author: Hugo W.L. ter Doest
