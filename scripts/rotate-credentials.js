#!/usr/bin/env node
/**
 * Rotate the Gate Pass backend credentials.
 *
 * The committed .env exposed a shared Atlas user (atlasAdmin) and a weak
 * JWT secret. This script creates a dedicated, least-privilege database user
 * for this service and generates fresh JWT/QR secrets, so the exposed shared
 * credential can be retired separately without breaking other apps that may
 * still use it.
 *
 * It does NOT touch the deployment platform: it writes the new values to a
 * 0600 file that you paste into the service's environment variables.
 *
 * Usage:
 *   MONGO_URI=... node scripts/rotate-credentials.js           # dry run
 *   MONGO_URI=... node scripts/rotate-credentials.js --apply   # rotate
 *   MONGO_URI=... node scripts/rotate-credentials.js --delete  # remove the new user
 *
 * Options:
 *   --user <name>   database user to create (default: gatepass_app)
 *   --db <name>     database to grant access to (default: GatePass)
 *   --out <path>    where to write the credentials (default: /tmp/gate-pass-credentials.json)
 *   --uri <uri>     admin connection string (default: MONGO_URI)
 */

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { MongoClient } = require("mongodb");

const args = process.argv.slice(2);
const hasFlag = (flag) => args.includes(flag);
const option = (name, fallback) => {
  const index = args.indexOf(`--${name}`);
  if (index === -1) return fallback;
  return args[index + 1] || fallback;
};

const apply = hasFlag("--apply");
const remove = hasFlag("--delete");
const username = option("user", "gatepass_app");
const database = option("db", "GatePass");
const outPath = option("out", "/tmp/gate-pass-credentials.json");
const adminUri = option("uri", process.env.MONGO_URI);

function fail(message) {
  console.error(`error: ${message}`);
  process.exit(1);
}

if (!adminUri) fail("MONGO_URI is not set (or pass --uri)");

function withPassword(uri, user, password) {
  const parsed = new URL(uri);
  parsed.username = encodeURIComponent(user);
  parsed.password = encodeURIComponent(password);
  // The dedicated user lives in the admin database; be explicit so the
  // connection string works regardless of the database in the path.
  parsed.searchParams.set("authSource", "admin");
  return parsed.toString();
}

function randomSecret() {
  return crypto.randomBytes(48).toString("base64url");
}

(async () => {
  const client = new MongoClient(adminUri, { serverSelectionTimeoutMS: 15000 });
  try {
    await client.connect();
    const admin = client.db("admin");
    const status = await admin.command({ connectionStatus: 1 });
    const currentUser = status.authInfo.authenticatedUsers[0]?.user;
    const roles = status.authInfo.authenticatedUserRoles.map(
      (r) => `${r.role}@${r.db}`
    );
    console.log(`connected as ${currentUser} (${roles.join(", ")})`);

    const canManageUsers =
      roles.some((role) =>
        [
          "atlasAdmin@admin",
          "userAdminAnyDatabase@admin",
          "userAdmin@admin",
          "root@admin",
        ].includes(role)
      ) ||
      // Local test servers run without auth, so there is no authenticated
      // user to inspect. Never set this against a real deployment.
      (roles.length === 0 && process.env.ALLOW_UNAUTHENTICATED_ADMIN === "1");

    if (!canManageUsers) {
      fail(
        "the connecting user cannot manage users; use an Atlas admin key or the dashboard"
      );
    }

    const existing = await admin
      .command({ usersInfo: { user: username, db: "admin" } })
      .catch(() => ({ users: [] }));
    const userExists = Boolean(existing.users && existing.users.length > 0);

    if (remove) {
      if (!userExists) {
        console.log(`nothing to drop: ${username} does not exist`);
        return;
      }
      if (!apply) {
        console.log(`dry run: would drop user ${username}`);
        return;
      }
      await admin.command({ dropUser: username });
      console.log(`dropped user ${username}`);
      return;
    }

    if (userExists) {
      fail(
        `user ${username} already exists; rerun with --delete first or pick another --user`
      );
    }

    const password = crypto.randomBytes(24).toString("base64url");
    const mongoUri = withPassword(adminUri, username, password);

    if (!apply) {
      console.log(`dry run: would create ${username} with readWrite on ${database}`);
      console.log(`dry run: would write new MONGO_URI, JWT_SECRET and QR_SECRET to ${outPath}`);
      return;
    }

    await admin.command({
      createUser: username,
      pwd: password,
      roles: [{ role: "readWrite", db: database }],
    });
    console.log(`created ${username} with readWrite on ${database}`);

    // Prove the new credential works before it is handed to the platform.
    // If it does not, roll the account back rather than leaving a stray user.
    const verifier = new MongoClient(mongoUri, { serverSelectionTimeoutMS: 15000 });
    try {
      await verifier.connect();
      await verifier.db(database).command({ ping: 1 });
      await verifier.db(database).collection("gatepasses").findOne({});
      console.log("verified the new connection string (auth + read)");
    } catch (error) {
      await admin.command({ dropUser: username }).catch(() => {});
      fail(`new credentials failed verification, user dropped: ${error.message}`);
    } finally {
      await verifier.close().catch(() => {});
    }

    const credentials = {
      MONGO_URI: mongoUri,
      JWT_SECRET: randomSecret(),
      QR_SECRET: randomSecret(),
      rotatedAt: new Date().toISOString(),
      databaseUser: username,
      database,
    };

    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, `${JSON.stringify(credentials, null, 2)}\n`, {
      mode: 0o600,
    });
    fs.chmodSync(outPath, 0o600);
    console.log(`wrote credentials to ${outPath} (mode 0600)`);
    console.log(
      "next: set MONGO_URI, JWT_SECRET and QR_SECRET on the service, redeploy, then verify"
    );
  } finally {
    await client.close().catch(() => {});
  }
})().catch((error) => fail(error.message));
