const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const { JWT_SECRET } = require("../config/secrets");

const PUBLIC_ROLES = ["student", "mentor"];
const PRIVILEGED_ROLES = ["admin", "warden", "security"];
const ALL_ROLES = [...PUBLIC_ROLES, ...PRIVILEGED_ROLES];

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Never return the password hash to a client. */
function sanitizeUser(user) {
  const plain = user.toObject ? user.toObject() : { ...user };
  delete plain.password;
  return plain;
}

function badRequest(res, message) {
  return res.status(400).json({ success: false, message });
}

/**
 * Staff accounts cannot be self-created, except by:
 *  - an authenticated admin (provisioning other staff),
 *  - a caller presenting STAFF_SIGNUP_KEY in the x-staff-key header,
 *  - the very first admin on an empty deployment (bootstrap only).
 */
async function canCreatePrivilegedRole(role, req) {
  const staffKey = process.env.STAFF_SIGNUP_KEY;
  if (staffKey && req.header("x-staff-key") === staffKey) return true;

  const authHeader = req.header("Authorization");
  if (authHeader && authHeader.startsWith("Bearer ")) {
    try {
      const decoded = jwt.verify(
        authHeader.slice("Bearer ".length).trim(),
        JWT_SECRET
      );
      const requester = await User.findById(decoded.id);
      if (requester && requester.role === "admin") return true;
    } catch {
      // Fall through to the bootstrap check.
    }
  }

  if (role === "admin") {
    const existing = await User.exists({ role: { $in: PRIVILEGED_ROLES } });
    return !existing;
  }

  return false;
}

// Register User
exports.registerUser = async (req, res) => {
  try {
    const {
      name,
      email,
      password,
      role,
      dept,
      year,
      rollNo,
      phoneNo,
    } = req.body || {};

    if (!name || !String(name).trim()) return badRequest(res, "Name is required");
    if (!email || !EMAIL_PATTERN.test(String(email).trim())) {
      return badRequest(res, "A valid email is required");
    }
    if (!password || String(password).length < 6) {
      return badRequest(res, "Password must be at least 6 characters");
    }
    if (!ALL_ROLES.includes(role)) {
      return badRequest(res, "Invalid role");
    }

    const normalizedEmail = String(email).trim().toLowerCase();

    if (PRIVILEGED_ROLES.includes(role)) {
      const allowed = await canCreatePrivilegedRole(role, req);
      if (!allowed) {
        return res.status(403).json({
          success: false,
          message:
            "Staff accounts must be created by an administrator. Public signup is limited to students and mentors.",
        });
      }
    }

    if (role === "student" && (!dept || !year || !rollNo || !phoneNo)) {
      return badRequest(
        res,
        "Department, year, roll number and phone number are required for students"
      );
    }
    if (role === "mentor" && (!dept || !year)) {
      return badRequest(res, "Department and year are required for mentors");
    }

    // Optional hardening: restrict mentor self-registration to a college
    // domain. Unset means any domain is accepted (pre-existing behaviour).
    const mentorDomain = process.env.MENTOR_EMAIL_DOMAIN;
    if (
      role === "mentor" &&
      mentorDomain &&
      !normalizedEmail.endsWith(`@${mentorDomain.toLowerCase()}`)
    ) {
      return res.status(403).json({
        success: false,
        message: `Mentor accounts must use an @${mentorDomain} email address`,
      });
    }

    let user = await User.findOne({ email: normalizedEmail });
    if (user) {
      return res
        .status(400)
        .json({ success: false, message: "User already exists" });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(String(password), salt);

    const base = {
      name: String(name).trim(),
      email: normalizedEmail,
      password: hashedPassword,
      role,
    };

    let newUser;
    if (role === "student") {
      newUser = new User({
        ...base,
        dept,
        year,
        rollNo,
        phoneNo,
      });
    } else if (role === "mentor") {
      newUser = new User({ ...base, dept, year });
    } else {
      newUser = new User(base);
    }

    await newUser.save();
    return res.status(201).json({
      success: true,
      message: `${role} registered successfully`,
      user: sanitizeUser(newUser),
    });
  } catch (error) {
    if (error && error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: "Email, roll number or phone number already in use",
      });
    }
    console.error("Register error:", error);
    return res
      .status(500)
      .json({ success: false, message: "Server error" });
  }
};

// Login User
exports.loginUser = async (req, res) => {
  try {
    const { email, password } = req.body || {};

    if (!email || !password) {
      return badRequest(res, "Email and password are required");
    }

    const user = await User.findOne({
      email: String(email).trim().toLowerCase(),
    }).select("+password");

    if (!user) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid credentials" });
    }

    const isMatch = await bcrypt.compare(String(password), user.password);
    if (!isMatch) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid credentials" });
    }

    const token = jwt.sign(
      { id: user._id, role: user.role },
      JWT_SECRET,
      { expiresIn: "30d" }
    );

    return res.status(200).json({
      success: true,
      message: "Login successful",
      token,
      user: sanitizeUser(user),
    });
  } catch (error) {
    console.error("Login error:", error);
    return res
      .status(500)
      .json({ success: false, message: "Server error" });
  }
};
