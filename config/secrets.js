const jwtSecret = process.env.JWT_SECRET;
// QR tokens may use a dedicated secret; falling back to the JWT secret is
// safe (same cryptographic strength) and keeps existing deployments working.
const qrSecret = process.env.QR_SECRET || jwtSecret;

if (!jwtSecret) {
  throw new Error(
    "JWT_SECRET is not set. Refusing to start with unsigned tokens."
  );
}

module.exports = { JWT_SECRET: jwtSecret, QR_SECRET: qrSecret };
