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

## Authorization model

| Route | Who |
| --- | --- |
| `POST /api/gatepass/apply` | student (owner comes from the token) |
| `GET /api/gatepass/` | admin, warden |
| `GET /api/gatepass/email` | student (own only), staff |
| `GET /api/gatepass/passdata/:id` | owner, staff |
| `GET /api/gatepass/:id/qr` | owner, security, admin |
| `POST /api/gatepass/verify` | security, admin |
| `PUT /api/gatepass/update/:id` | role-scoped transitions, see below |
| `GET /api/mentor/deptyear` | mentor (own dept/year from token) |

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
