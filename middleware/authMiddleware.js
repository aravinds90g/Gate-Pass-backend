const jwt = require("jsonwebtoken");
const User = require("../models/User");
const { JWT_SECRET } = require("../config/secrets");

/**
 * Verifies the bearer token and loads the current user from the database.
 * Loading the user (instead of trusting token claims) means a deleted
 * account, a changed role or a changed department takes effect immediately
 * instead of at token expiry.
 */
const authMiddleware = (allowedRoles = []) => {
  return async (req, res, next) => {
    const authHeader = req.header("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        success: false,
        message: "Authorization token required",
      });
    }

    const token = authHeader.slice("Bearer ".length).trim();
    if (!token) {
      return res.status(401).json({
        success: false,
        message: "Invalid token format",
      });
    }

    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      const user = await User.findById(decoded.id).select("-password");

      if (!user) {
        return res.status(401).json({
          success: false,
          message: "Account no longer exists",
        });
      }

      req.user = {
        id: String(user._id),
        name: user.name,
        email: user.email,
        role: user.role,
        dept: user.dept,
        year: user.year,
        rollNo: user.rollNo,
      };

      if (allowedRoles.length > 0 && !allowedRoles.includes(req.user.role)) {
        return res.status(403).json({
          success: false,
          message: "Insufficient permissions",
        });
      }

      return next();
    } catch (err) {
      let message = "Invalid token";
      if (err.name === "TokenExpiredError") {
        message = "Token expired";
      } else if (err.name === "JsonWebTokenError") {
        message = "Malformed token";
      }

      return res.status(401).json({ success: false, message });
    }
  };
};

module.exports = authMiddleware;
