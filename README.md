# Gate Pass Backend

Express + MongoDB API for the CampusPass app.

## Setup

```bash
npm install
cp .env.example .env   # fill in MONGO_URI and a long JWT_SECRET
npm run dev
```

`JWT_SECRET` is required: the server refuses to start without it. Node 18-22
is supported (Node 26 removed `buffer.SlowBuffer`, which `jsonwebtoken`'s
transitive dependency still uses).

## Staff accounts

Public `POST /api/auth/register` only accepts `student` and `mentor`. Staff
(`admin`, `warden`, `security`) are created by:

1. an authenticated admin calling `POST /api/auth/register`, or
2. a caller sending `x-staff-key: $STAFF_SIGNUP_KEY`, or
3. bootstrap: when no staff account exists yet, the first `admin` may be
   registered without authentication. Create it immediately after deploying.

Mentors may self-register, but their department/year is self-declared. Set
`MENTOR_EMAIL_DOMAIN` (e.g. `college.edu`) to require a college email for
mentor signup, and review mentor accounts before relying on them.

## Deploying

`render.yaml` declares `npm ci` as the build command, `npm start` as the
start command and `/` as the health check. Dependencies are no longer
committed, so the platform must install them on every build. If the
service is not managed by a Render Blueprint, set the same commands in the
dashboard.

Node 18-22 is supported; `render.yaml` pins `NODE_VERSION=22.20.0`.

## Rotating credentials

The original `.env` (shared Atlas user + weak `JWT_SECRET`) is in git
history. Treat those values as public and do not reuse them.

```bash
MONGO_URI="<admin connection string>" \
  node scripts/rotate-credentials.js --apply
```

This creates a dedicated `gatepass_app` user with `readWrite` on `GatePass`
only, verifies the new login, and writes a `0600` JSON file containing a new
`MONGO_URI`, `JWT_SECRET` and `QR_SECRET`. Set those three on the service,
redeploy, then check:

```bash
curl -i https://<host>/api/gatepass/   # must be 401
```

Rotate the old shared Atlas user separately - other databases in the
cluster may still use it. `--delete` removes the dedicated user if the
rotation is aborted.

## Authorization model

| Route | Who |
| --- | --- |
| `POST /api/gatepass/apply` | student (owner comes from the token) |
| `GET /api/gatepass/` | admin, warden |
| `GET /api/gatepass/email` | student (own only) |
| `GET /api/gatepass/passdata/:id` | owner, staff |
| `GET /api/gatepass/:id/qr` | owner, security, admin |
| `POST /api/gatepass/verify` | security, admin |
| `PUT /api/gatepass/update/:id` | role-scoped transitions, see below |
| `GET /api/mentor/deptyear` | mentor (own dept/year from token, no parent contact) |

Status transitions are enforced server-side:

- mentor: `pending -> rejected`, or `forwarded = true` (Home passes, own cohort)
- warden: `pending -> approved/rejected` (non-Home passes)
- admin: `pending -> approved/rejected` (forwarded Home passes, or any pending)
- security: `approved -> active`, `active -> expired`

Actor names and timestamps are derived from the token; clients cannot set
`approvedBy`, `rejectedBy` or any `*At` field.

QR codes carry a short-lived (10 minute) HMAC-signed token issued by
`GET /api/gatepass/:id/qr`; a bare pass id is no longer accepted by the
scanner.
