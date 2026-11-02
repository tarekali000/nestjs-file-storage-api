# NestJS File Storage API

A secure, owner-scoped file management REST API built with **NestJS, TypeScript, Prisma ORM, SQLite, Multer and Swagger**. It supports single/multiple uploads, file validation, SHA-256 checksums, paginated listing, downloads, deletion and per-user storage statistics.

## Features

- JWT authentication (`register` / `login`) and strict per-user file ownership.
- Single and multiple multipart uploads (up to 10 files per request).
- 10 MB maximum per file; extension allowlist: PNG, JPG/JPEG, WEBP, PDF, DOCX, TXT and ZIP.
- Content-signature checks for binary formats; DOCX is checked for its ZIP container markers; TXT is checked for valid UTF-8 and null bytes.
- Random UUID storage names; original names are never used as filesystem paths.
- SHA-256 checksum, MIME metadata, byte size and upload timestamp stored in SQLite.
- Pagination, download streaming, deletion and user-scoped statistics.
- Swagger UI and generated OpenAPI JSON.
- Compensating cleanup when database persistence fails; deletion uses a temporary rename before deleting metadata.
- Uploads are stored outside the public web root.

## Requirements

- Node.js 20+
- npm 10+
- No external database server is required (SQLite is local).

## Quick start

```bash
npm install
cp .env.example .env
```

Set a strong `JWT_SECRET` in `.env`, then:

```bash
npx prisma generate
npx prisma migrate dev --name init
npm run start:dev
```

The API is available at `http://localhost:3000/api/v1`.

- Swagger UI: `http://localhost:3000/docs`
- OpenAPI JSON: `http://localhost:3000/docs-json`

## Authentication

Register:

```http
POST /api/v1/auth/register
Content-Type: application/json

{"username":"tarek","password":"StrongPassword123!"}
```

Login:

```http
POST /api/v1/auth/login
Content-Type: application/json

{"username":"tarek","password":"StrongPassword123!"}
```

Both return `{ "user": {...}, "accessToken": "..." }`. In Swagger, click **Authorize** and enter the token as `Bearer <token>` (Swagger's bearer scheme may accept the raw token; do not include `Bearer` if the dialog adds it automatically).

All `/files` endpoints require a valid JWT.

## API endpoints

Base path: `/api/v1`

| Method | Endpoint | Description |
|---|---|---|
| POST | `/auth/register` | Register a user |
| POST | `/auth/login` | Login |
| POST | `/files/upload` | Upload one file (`file`) |
| POST | `/files/upload/multiple` | Upload multiple files (`files`) |
| GET | `/files?page=1&limit=10` | List own files |
| GET | `/files/stats` | Own storage statistics |
| GET | `/files/:id` | Get own file metadata |
| GET | `/files/:id/download` | Download an owned file |
| DELETE | `/files/:id` | Delete an owned file (204) |

The seven file endpoints match the supplied project specification. Two authentication endpoints are added to make ownership and authorization enforceable rather than simulated.

### Upload examples

Single file:

```bash
curl -X POST http://localhost:3000/api/v1/files/upload \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -F "file=@./report.pdf"
```

Multiple files:

```bash
curl -X POST http://localhost:3000/api/v1/files/upload/multiple \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -F "files=@./report.pdf" \
  -F "files=@./image.png"
```

List:

```bash
curl "http://localhost:3000/api/v1/files?page=1&limit=10" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

Download:

```bash
curl -L "http://localhost:3000/api/v1/files/FILE_UUID/download" \
  -H "Authorization: Bearer YOUR_TOKEN" -o downloaded-file
```

## Validation and security notes

- Maximum size defaults to 10 MiB per file. Configure `MAX_FILE_SIZE_MB`.
- Maximum number of files in a multiple-upload request defaults to 10. Configure `MAX_FILES_PER_REQUEST`.
- The upload interceptor applies a 10 MiB Multer limit. If you change `MAX_FILE_SIZE_MB`, also update the two Multer `limits.fileSize` values in `files.controller.ts` to match.
- MIME type supplied by the client is not trusted; the API derives the stored MIME type from the allowed extension and inspects file bytes.
- ZIP and DOCX share a ZIP container signature. DOCX additionally requires `[Content_Types].xml` and `word/document.xml` markers. This is a practical structural check, not full malware scanning or comprehensive file-format validation.
- TXT is validated as UTF-8 text without NUL bytes; it is not a guarantee that text content is safe to render as HTML.
- Files are held in memory during upload before being persisted. Keep the request/file limits conservative for the deployment environment.
- Paths are generated server-side and are not returned by the API.
- Every file query is scoped to the authenticated user; another user's file returns 403.
- A filesystem and SQLite transaction cannot be truly atomic together. The service uses compensating actions and a rename-to-trash deletion flow, but production deployments should add a reconciliation job for rare process-crash windows.
- Do not expose `storage/uploads` as a public static directory.

## Project structure

```text
src/
  auth/
    dto/
    strategies/
    auth.controller.ts
    auth.service.ts
    auth.module.ts
  files/
    dto/
    interfaces/
    files.controller.ts
    files.service.ts
    files.module.ts
    files.utils.ts
  prisma/
    prisma.module.ts
    prisma.service.ts
  storage/
    storage.module.ts
    storage.service.ts
  app.module.ts
  main.ts
prisma/
  schema.prisma
test/
  app.e2e-spec.ts
storage/
  uploads/
```

## Tests

```bash
npm test
npm run test:e2e
```

The included E2E test checks user registration. Before running it, apply the migration to the test database: `DATABASE_URL="file:./test.db" npx prisma migrate deploy` (run this from the project root; Prisma resolves the SQLite path relative to `prisma/schema.prisma`). Extend the suite with upload, invalid signature, oversize, ownership, download checksum and delete scenarios before production use.

## 50-file concurrency challenge

A recommended manual verification procedure:

1. Register two users and obtain separate JWTs.
2. Upload 50 test files concurrently using the first user's token.
3. Verify 50 unique `storedName` values and 50 metadata records.
4. Download each file and compare its SHA-256 with the stored `checksum`.
5. Attempt to download/delete a first-user file with the second user's token; expect `403`.
6. Force a database failure in a test environment and verify the corresponding stored file is cleaned up.
7. Inspect `storage/uploads` and confirm no temporary `.tmp` or `.deleting` files remain after successful operations.

This repository provides the implementation foundation and a starter E2E test; the 50-file load test and full integration matrix still need to be executed in your environment.

## Environment variables

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | HTTP port |
| `DATABASE_URL` | `file:./dev.db` | SQLite connection |
| `JWT_SECRET` | none | Required signing secret |
| `JWT_EXPIRES_IN` | `1d` | Access-token lifetime |
| `UPLOAD_DIR` | `./storage/uploads` | Private file directory |
| `MAX_FILE_SIZE_MB` | `10` | Per-file limit |
| `MAX_FILES_PER_REQUEST` | `10` | Multi-upload count limit |

## GitHub repository description

**Secure file storage REST API built with NestJS, Prisma, SQLite and Swagger. Features JWT authentication, owner-based authorization, multipart uploads, file signature validation, SHA-256 checksums, pagination, streaming downloads and storage statistics.**

## License

MIT
