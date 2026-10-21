const express = require("express");
const router = express.Router();
const {
  createGatePass,
  getAllGatePasses,
  updateGatePass,
  getGatePassesByEmail,
  getGatePassById,
  getGatePassQr,
  verifyGatePassQr,
} = require("../controllers/gatePassController");
const authMiddleware = require("../middleware/authMiddleware");

// Apply for a gate pass (students only; ownership comes from the token)
router.post("/apply", authMiddleware(["student"]), createGatePass);

// Admin + warden dashboards list every pass
router.get("/", authMiddleware(["admin", "warden"]), getAllGatePasses);

// Students read their own passes; staff may query a student by email
router.get(
  "/email",
  authMiddleware(["student", "mentor", "warden", "admin", "security"]),
  getGatePassesByEmail
);

// Security scans a signed QR token
router.post(
  "/verify",
  authMiddleware(["security", "admin"]),
  verifyGatePassQr
);

// Short-lived signed token for a student's QR code
router.get(
  "/:id/qr",
  authMiddleware(["student", "security", "admin"]),
  getGatePassQr
);

// Approve / reject / forward / activate / expire
router.put(
  "/update/:id",
  authMiddleware(["admin", "security", "warden", "mentor"]),
  updateGatePass
);

// Single pass details (owner or staff)
router.get(
  "/passdata/:id",
  authMiddleware(["student", "mentor", "warden", "admin", "security"]),
  getGatePassById
);

module.exports = router;
