const express = require("express");
const router = express.Router();

const {
  getGatePassByDeptAndYear,
} = require("../controllers/gatePassController");
const authMiddleware = require("../middleware/authMiddleware");

router.get(
  "/deptyear",
//   authMiddleware(["admin", "security"]),
  getGatePassByDeptAndYear
);

module.exports = router;