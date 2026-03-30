# recruiter

Find developers by what they've actually built, not keyword bingo.

Developers authenticate with GitHub and record work footprints — short summaries of what they built, tagged with technologies. Footprints are embedded into vectors and stored in PostgreSQL with pgvector. Recruiters query with natural language through an MCP tool and get ranked candidates back, grouped by developer, with GitHub profiles attached.

## How It Works

```
Developer                                     Recruiter
    |                                             |
    |  1. Auth via GitHub OAuth                   |
    |  2. Record footprints (summary + tags)      |
    |          |                                   |
    |          v                                   |
    |   [ Actor System ]                           |
    |          |                                   |
    |   embed via transformers.js (384-dim)        |
    |          |                                   |
    |          v                                   |
    |   [ PostgreSQL + pgvector ]  <--- 4. find_candidates("need a React + WebGL dev")
    |                                   |
    |                                   v
    |                           5. Ranked results grouped by user
    |                              with GitHub profiles
```

## Architecture

| Layer | Technology |
|-------|-----------|
| Runtime | Node.js + TypeScript |
| HTTP | Hono |
| Database | PostgreSQL + pgvector (Drizzle ORM) |
| Embeddings | transformers.js (all-MiniLM-L6-v2, 384 dims, in-process) |
| Actor System | libeam -- async ingestion pipeline, HTTP server lifecycle |
| Auth | GitHub OAuth via arctic + device code flow for MCP clients |
| MCP | Model Context Protocol server (3 tools) |
| Tests | Vitest + PGlite (in-process Postgres for integration tests) |

## MCP Tools

The MCP server exposes three tools for use in any MCP-compatible client (Claude Desktop, Cursor, etc.):

| Tool | Description |
|------|-------------|
| `recruiter_auth` | GitHub device code auth flow. Opens browser, polls for completion, stores session token locally. |
| `record_footprint` | Record a work footprint: summary, tags, and optional metadata (repo, branch, file paths). |
| `find_candidates` | Semantic search across all footprints. Returns ranked developers with scores, grouped footprints, and GitHub profile links. |

## Quick Start

```bash
git clone git@github.com:AlexandruCalinica/recruiter.git
cd recruiter
pnpm install
cp .env.example .env  # fill in GitHub OAuth credentials + DATABASE_URL
pnpm db:migrate
pnpm dev
```

MCP server (stdio transport, for editor integrations):

```bash
pnpm mcp:dev
```

## Scripts

| Script | Description |
|--------|-------------|
| `pnpm dev` | Start dev server with hot reload |
| `pnpm build` | Build with tsup |
| `pnpm start` | Run production build |
| `pnpm typecheck` | Type-check without emitting |
| `pnpm test` | Run all tests (watch mode) |
| `pnpm test:integration` | Run integration tests only |
| `pnpm db:generate` | Generate Drizzle migrations |
| `pnpm db:migrate` | Apply migrations |
| `pnpm mcp:dev` | Start MCP server (stdio) |

## Project Structure

```
src/
├── actors/          # libeam actors (HTTP server, ingestion pipeline)
├── api/
│   ├── middleware/   # session auth
│   └── routes/      # auth, footprints, match
├── auth/            # GitHub OAuth, device code store
├── db/              # schema, migrations, connection
├── mcp/             # MCP server + local token storage
├── services/        # embedding, ingestion, matching
└── shared/          # Zod schemas, types
```

## Requirements

- Node.js 20+
- PostgreSQL with the pgvector extension
- A GitHub OAuth app (client ID + secret)

## License

MIT
