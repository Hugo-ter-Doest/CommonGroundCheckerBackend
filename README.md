# Common Ground Checker Backend

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
- `src/lib/checkers` � domain checkers and analysis orchestration logic
- `prisma/schema.prisma` � database model definitions for repositories, analyses, and scoring configuration

## API

### Supported endpoints

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/openapi` | Retrieve the generated OpenAPI specification |
| `GET` | `/api/repositories` | List known repositories and their latest summary |
| `GET` | `/api/repositories/export` | Export repository analysis history as CSV |
| `POST` | `/api/repositories` | Create or update repository metadata |
| `POST` | `/api/repositories/{repoId}/analyses` | Persist a new analysis result for an existing repository |
| `GET` | `/api/admin/scoring` | Retrieve the current scoring configuration snapshot |
| `POST` | `/api/admin/scoring` | Save a new scoring configuration snapshot |
| `GET` | `/api/repo-history` | Retrieve analysis history for a repository by owner/repo |

### Request/response shape

- `/api/repositories` expects JSON metadata containing `repoUrl` and optional repository fields.
- The literal OpenAPI specification is stored in `src/app/api/openapi/openapi.yaml` and served by `/api/openapi`.
- `/api/repositories/{repoId}/analyses` expects analysis result payloads including `checkedAt`, `score`, and `results`.
- `/api/admin/scoring` exposes and persists custom scoring parameters for criterion weights, complexity thresholds, and Spectral ruleset selection.

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

## Docker

Build the production image with:

```bash
docker build -t common-ground-checker-backend .
```

Run it with:

```bash
docker run -p 3000:3000 --env-file .env common-ground-checker-backend
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
