const express = require("express");
const router = express.Router();

const {
  getGatePassByDeptAndYear,
} = require("../controllers/gatePassController");
const authMiddleware = require("../middleware/authMiddleware");

// Mentors see pending Home passes for their own department/year only; the
// cohort is taken from the token, not from the query string.
router.get(
  "/deptyear",
  authMiddleware(["mentor"]),
  getGatePassByDeptAndYear
);

module.exports = router;
