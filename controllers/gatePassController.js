const crypto = require("crypto");
const mongoose = require("mongoose");
const GatePass = require("../models/GatePass");
const { QR_SECRET } = require("../config/secrets");

const STAFF_ROLES = ["admin", "warden", "security", "mentor"];
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const STUDENT_FIELDS = "name rollNo dept year email";

const QR_TTL_MS = 10 * 60 * 1000;
const DUPLICATE_WINDOW_MS = 15 * 1000;

function isStaff(role) {
  return STAFF_ROLES.includes(role);
}

function isValidId(id) {
  return mongoose.isValidObjectId(id);
}

/** True when the pass's last travel day is before today (UTC calendar day). */
function travelWindowEnded(pass, now = new Date()) {
  const lastDay = pass.comingDate || pass.date;
  if (!DATE_PATTERN.test(String(lastDay || ""))) return false;
  const today = now.toISOString().slice(0, 10);
  return String(lastDay) < today;
}

function signQrPayload(passId, expiresAt) {
  return crypto
    .createHmac("sha256", QR_SECRET)
    .update(`${passId}.${expiresAt}`)
    .digest("base64url");
}

function signaturesMatch(expected, received) {
  const a = Buffer.from(expected);
  const b = Buffer.from(received);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

// Apply for a gate pass
exports.createGatePass = async (req, res) => {
  try {
    if (req.user.role !== "student") {
      return res.status(403).json({
        success: false,
        message: "Only students can apply for a gate pass",
      });
    }

    // `email` in the body is ignored on purpose: the pass always belongs to
    // the authenticated student, never to whoever the client names.
    const {
      reason,
      date,
      time,
      destination,
      comingDate,
      parentName,
      parentContact,
      customReason,
      reasonForGoingHome,
    } = req.body || {};

    // Normalise once so validation, the duplicate guard and the stored
    // document all compare exactly the same values.
    const cleanDate = String(date || "").trim();
    const cleanTime = String(time || "").trim();
    const cleanDestination = String(destination || "").trim();
    const cleanComingDate = String(comingDate || "").trim();

    if (!["Home", "Others"].includes(reason)) {
      return res
        .status(400)
        .json({ success: false, message: "A valid reason is required" });
    }
    if (!DATE_PATTERN.test(cleanDate)) {
      return res
        .status(400)
        .json({ success: false, message: "A valid leaving date is required" });
    }
    if (!cleanTime) {
      return res
        .status(400)
        .json({ success: false, message: "A leaving time is required" });
    }
    if (!cleanDestination) {
      return res
        .status(400)
        .json({ success: false, message: "A destination is required" });
    }

    if (reason === "Others" && !String(customReason || "").trim()) {
      return res
        .status(400)
        .json({ success: false, message: "A custom reason is required" });
    }

    if (reason === "Home") {
      if (!DATE_PATTERN.test(cleanComingDate) || cleanComingDate < cleanDate) {
        return res.status(400).json({
          success: false,
          message: "A return date on or after the leaving date is required",
        });
      }
      if (!String(parentName || "").trim()) {
        return res
          .status(400)
          .json({ success: false, message: "Parent's name is required" });
      }
      if (!/^\d{10}$/.test(String(parentContact || ""))) {
        return res.status(400).json({
          success: false,
          message: "A valid 10-digit parent contact is required",
        });
      }
      if (!String(reasonForGoingHome || "").trim()) {
        return res.status(400).json({
          success: false,
          message: "Reason for going home is required",
        });
      }
    }

    // Server-side duplicate guard for retried/rapid double submits.
    const recentDuplicate = await GatePass.exists({
      student: req.user.id,
      date: cleanDate,
      time: cleanTime,
      destination: cleanDestination,
      reason,
      appliedAt: { $gte: new Date(Date.now() - DUPLICATE_WINDOW_MS) },
    });
    if (recentDuplicate) {
      return res.status(409).json({
        success: false,
        message: "This gate pass was just submitted.",
      });
    }

    const gatePass = new GatePass({
      student: req.user.id,
      year: req.user.year,
      dept: req.user.dept,
      rollNo: req.user.rollNo,
      name: req.user.name,
      destination: cleanDestination,
      reason,
      date: cleanDate,
      time: cleanTime,
      comingDate: reason === "Home" ? cleanComingDate : undefined,
      parentName: reason === "Home" ? parentName : undefined,
      parentContact: reason === "Home" ? parentContact : undefined,
      reasonForGoingHome:
        reason === "Home" ? reasonForGoingHome : undefined,
      customReason: reason === "Others" ? customReason : undefined,
      forwarded: false,
      forwardedAt: null,
      approvedBy: null,
      rejectedBy: null,
      rejectedAt: null,
      approvedAt: null,
      expiredAt: null,
      activedAt: null,
      status: "pending",
    });

    await gatePass.save();

    return res.status(201).json({
      success: true,
      message: "Gate pass created successfully!",
      gatePass,
    });
  } catch (error) {
    console.error("Create gate pass error:", error);
    return res
      .status(500)
      .json({ success: false, message: "Server error" });
  }
};

// Get all gate passes (admin and warden dashboards)
exports.getAllGatePasses = async (req, res) => {
  try {
    const gatePasses = await GatePass.find()
      .sort({ appliedAt: -1 })
      .limit(1000)
      .populate("student", STUDENT_FIELDS);
    return res.status(200).json(gatePasses);
  } catch (error) {
    console.error("Get all gate passes error:", error);
    return res
      .status(500)
      .json({ success: false, message: "Server error" });
  }
};

// Get gate passes for a student by email
exports.getGatePassesByEmail = async (req, res) => {
  try {
    const requested = String(req.query.email || "")
      .trim()
      .toLowerCase();

    let email;
    if (req.user.role === "student") {
      // Students may only ever read their own passes, whatever they ask for.
      if (requested && requested !== String(req.user.email).toLowerCase()) {
        return res.status(403).json({
          success: false,
          message: "You can only view your own gate passes",
        });
      }
      email = req.user.email;
    } else if (isStaff(req.user.role)) {
      if (!requested) {
        return res.status(400).json({
          success: false,
          message: "An email query parameter is required",
        });
      }
      email = requested;
    } else {
      return res
        .status(403)
        .json({ success: false, message: "Insufficient permissions" });
    }

    let studentId;
    if (req.user.role === "student") {
      studentId = req.user.id;
    } else {
      studentId = await resolveStudentId(email);
      if (!studentId) {
        return res
          .status(404)
          .json({ success: false, message: "Student not found!" });
      }
    }

    const gatePasses = await GatePass.find({ student: studentId })
      .sort({ appliedAt: -1 })
      .populate("student", STUDENT_FIELDS);

    return res.status(200).json(gatePasses);
  } catch (error) {
    console.error("Get gate passes by email error:", error);
    return res
      .status(500)
      .json({ success: false, message: "Server error" });
  }
};

async function resolveStudentId(email) {
  const User = require("../models/User");
  const student = await User.findOne({
    email: String(email).trim().toLowerCase(),
  }).select("_id");
  return student ? student._id : null;
}

// Get a specific gate pass by id
exports.getGatePassById = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidId(id)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid gate pass id" });
    }

    const gatePass = await GatePass.findById(id).populate(
      "student",
      STUDENT_FIELDS
    );

    if (!gatePass) {
      return res
        .status(404)
        .json({ success: false, message: "Gate pass not found!" });
    }

    if (req.user.role === "student" && !isOwner(gatePass, req.user.id)) {
      return res.status(403).json({
        success: false,
        message: "You can only view your own gate pass",
      });
    }

    return res.status(200).json(gatePass);
  } catch (error) {
    console.error("Get gate pass by id error:", error);
    return res
      .status(500)
      .json({ success: false, message: "Server error" });
  }
};

function isOwner(gatePass, userId) {
  const ownerId = gatePass.student && gatePass.student._id
    ? gatePass.student._id
    : gatePass.student;
  return String(ownerId) === String(userId);
}

const UPDATABLE_BY_ROLE = {
  mentor: ["status", "forwarded"],
  warden: ["status"],
  admin: ["status"],
  security: ["status"],
};

// Update a gate pass (approve, reject, forward, activate, expire)
exports.updateGatePass = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidId(id)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid gate pass id" });
    }

    const role = req.user.role;
    const allowedFields = UPDATABLE_BY_ROLE[role];
    if (!allowedFields) {
      return res
        .status(403)
        .json({ success: false, message: "Insufficient permissions" });
    }

    const body = req.body || {};
    const keys = Object.keys(body);
    if (keys.length === 0) {
      return res
        .status(400)
        .json({ success: false, message: "No update data provided" });
    }

    const invalidFields = keys.filter((key) => !allowedFields.includes(key));
    if (invalidFields.length > 0) {
      return res.status(400).json({
        success: false,
        message: `Invalid updates: ${invalidFields.join(", ")}`,
      });
    }

    const gatePass = await GatePass.findById(id);
    if (!gatePass) {
      return res
        .status(404)
        .json({ success: false, message: "Gate pass not found" });
    }

    const actor = req.user.name || role;
    const requestedStatus = body.status;

    if (role === "mentor") {
      if (gatePass.reason !== "Home") {
        return res.status(403).json({
          success: false,
          message: "Mentors only handle Home passes",
        });
      }
      if (
        String(gatePass.dept) !== String(req.user.dept) ||
        String(gatePass.year) !== String(req.user.year)
      ) {
        return res.status(403).json({
          success: false,
          message: "This pass belongs to another department or year",
        });
      }
      if (gatePass.status !== "pending") {
        return res.status(409).json({
          success: false,
          message: "Only pending passes can be acted on",
        });
      }
      if (gatePass.forwarded) {
        return res.status(409).json({
          success: false,
          message: "This pass has already been forwarded",
        });
      }
      if (requestedStatus && requestedStatus !== "rejected") {
        return res.status(400).json({
          success: false,
          message: "Mentors may only reject a pass",
        });
      }
      if (requestedStatus === "rejected") {
        gatePass.status = "rejected";
        gatePass.rejectedBy = actor;
        gatePass.rejectedAt = new Date();
      } else if (body.forwarded === true) {
        gatePass.forwarded = true;
        gatePass.forwardedAt = new Date();
      } else {
        return res
          .status(400)
          .json({ success: false, message: "No valid mentor action" });
      }
    }

    if (role === "warden") {
      if (gatePass.reason === "Home") {
        return res.status(403).json({
          success: false,
          message: "Home passes are approved by the administrator",
        });
      }
      if (gatePass.status !== "pending") {
        return res.status(409).json({
          success: false,
          message: "Only pending passes can be acted on",
        });
      }
      if (!["approved", "rejected"].includes(requestedStatus)) {
        return res
          .status(400)
          .json({ success: false, message: "Invalid status transition" });
      }
      if (requestedStatus === "approved") {
        gatePass.status = "approved";
        gatePass.approvedBy = actor;
        gatePass.approvedAt = new Date();
        gatePass.forwarded = false;
      } else {
        gatePass.status = "rejected";
        gatePass.rejectedBy = actor;
        gatePass.rejectedAt = new Date();
        gatePass.forwarded = false;
      }
    }

    if (role === "admin") {
      if (gatePass.status !== "pending") {
        return res.status(409).json({
          success: false,
          message: "Only pending passes can be acted on",
        });
      }
      if (gatePass.reason === "Home" && !gatePass.forwarded) {
        return res.status(409).json({
          success: false,
          message: "Home passes must be forwarded by a mentor first",
        });
      }
      if (!["approved", "rejected"].includes(requestedStatus)) {
        return res
          .status(400)
          .json({ success: false, message: "Invalid status transition" });
      }
      if (requestedStatus === "approved") {
        gatePass.status = "approved";
        gatePass.approvedBy = actor;
        gatePass.approvedAt = new Date();
        gatePass.forwarded = false;
      } else {
        gatePass.status = "rejected";
        gatePass.rejectedBy = actor;
        gatePass.rejectedAt = new Date();
        gatePass.forwarded = false;
      }
    }

    if (role === "security") {
      if (requestedStatus === "active") {
        if (gatePass.status !== "approved") {
          return res.status(409).json({
            success: false,
            message: "Only an approved pass can be activated",
          });
        }
        if (travelWindowEnded(gatePass)) {
          return res.status(409).json({
            success: false,
            message: "This pass's travel window has ended",
          });
        }
        gatePass.status = "active";
        gatePass.activedAt = new Date();
      } else if (requestedStatus === "expired") {
        if (gatePass.status !== "active") {
          return res.status(409).json({
            success: false,
            message: "Only an active pass can be marked expired",
          });
        }
        gatePass.status = "expired";
        gatePass.expiredAt = new Date();
      } else {
        return res
          .status(400)
          .json({ success: false, message: "Invalid status transition" });
      }
    }

    await gatePass.save();
    const updated = await GatePass.findById(id).populate(
      "student",
      STUDENT_FIELDS
    );

    return res.status(200).json({
      success: true,
      message: "Gate pass updated successfully",
      gatePass: updated,
    });
  } catch (error) {
    console.error("Update gate pass error:", error);
    return res
      .status(500)
      .json({ success: false, message: "Server error" });
  }
};

// Get passes by department and year (mentor dashboard)
exports.getGatePassByDeptAndYear = async (req, res) => {
  try {
    // The mentor's own department/year come from the token, so a mentor can
    // never enumerate another cohort by changing the query string.
    const { dept, year } = req.user;

    if (!dept || !year) {
      return res.status(400).json({
        success: false,
        message: "Department and year are missing on your account",
      });
    }

    const gatePasses = await GatePass.find({
      dept,
      year,
      status: "pending",
      reason: "Home",
      forwarded: false,
    })
      .sort({ appliedAt: -1 })
      .populate("student", STUDENT_FIELDS);

    return res.status(200).json(gatePasses);
  } catch (error) {
    console.error("Get passes by dept/year error:", error);
    return res
      .status(500)
      .json({ success: false, message: "Server error" });
  }
};

/**
 * Issue a short-lived signed token for the pass QR code. The QR no longer
 * carries a bare id, so a code cannot be forged or reused indefinitely.
 */
exports.getGatePassQr = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidId(id)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid gate pass id" });
    }

    const gatePass = await GatePass.findById(id);
    if (!gatePass) {
      return res
        .status(404)
        .json({ success: false, message: "Gate pass not found" });
    }

    if (req.user.role === "student" && !isOwner(gatePass, req.user.id)) {
      return res.status(403).json({
        success: false,
        message: "You can only generate a QR for your own pass",
      });
    }

    if (!["approved", "active"].includes(gatePass.status)) {
      return res.status(409).json({
        success: false,
        message: "This pass is not valid",
      });
    }
    if (travelWindowEnded(gatePass)) {
      return res.status(409).json({
        success: false,
        message: "This pass's travel window has ended",
      });
    }

    const expiresAt = Date.now() + QR_TTL_MS;
    const token = `v1.${gatePass._id}.${expiresAt}.${signQrPayload(
      gatePass._id,
      expiresAt
    )}`;

    return res.status(200).json({
      success: true,
      token,
      expiresAt: new Date(expiresAt).toISOString(),
    });
  } catch (error) {
    console.error("Generate QR error:", error);
    return res
      .status(500)
      .json({ success: false, message: "Server error" });
  }
};

/** Verify a scanned QR token (security/admin only). */
exports.verifyGatePassQr = async (req, res) => {
  try {
    const { token } = req.body || {};
    if (!token || typeof token !== "string") {
      return res
        .status(400)
        .json({ success: false, message: "A QR token is required" });
    }

    const parts = token.split(".");
    if (parts.length !== 4 || parts[0] !== "v1") {
      return res
        .status(400)
        .json({ success: false, message: "Invalid QR code" });
    }

    const [, passId, expiresAtRaw, signature] = parts;
    const expiresAt = Number(expiresAtRaw);

    if (!isValidId(passId) || !Number.isFinite(expiresAt)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid QR code" });
    }

    const expected = signQrPayload(passId, expiresAt);
    if (!signaturesMatch(expected, signature)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid QR code" });
    }

    if (expiresAt < Date.now()) {
      return res
        .status(410)
        .json({ success: false, message: "QR code expired, refresh it" });
    }

    const gatePass = await GatePass.findById(passId).populate(
      "student",
      STUDENT_FIELDS
    );
    if (!gatePass) {
      return res
        .status(404)
        .json({ success: false, message: "Gate pass not found" });
    }

    if (!["approved", "active"].includes(gatePass.status)) {
      return res
        .status(409)
        .json({ success: false, message: "This pass is not valid" });
    }
    if (travelWindowEnded(gatePass)) {
      return res
        .status(409)
        .json({ success: false, message: "This pass's travel window has ended" });
    }

    return res.status(200).json(gatePass);
  } catch (error) {
    console.error("Verify QR error:", error);
    return res
      .status(500)
      .json({ success: false, message: "Server error" });
  }
};
