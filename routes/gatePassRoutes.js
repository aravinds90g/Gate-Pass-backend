const express = require("express");
const router = express.Router();
const {
  createGatePass,
  getAllGatePasses,
  updateGatePass,
  rejectGatePass,
  getGatePassesByEmail,
  getGatePassById,
} = require("../controllers/gatePassController");
const authMiddleware = require("../middleware/authMiddleware");

// Apply for a gate pass
router.post("/apply", createGatePass);

// Get all gate pass requests
router.get("/", getAllGatePasses);

router.get("/email", getGatePassesByEmail);
// Approve a gate pass
router.put(
  "/update/:id",
  authMiddleware(["admin", "security","warden","mentor"]),
  updateGatePass
);

router.get("/passdata/:id", getGatePassById);

// Get pass by dept and year





// Reject a gate pass


module.exports = router;
