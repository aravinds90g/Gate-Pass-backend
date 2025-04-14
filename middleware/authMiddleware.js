const jwt = require("jsonwebtoken");

const authMiddleware = (allowedRoles = []) => {
  return (req, res, next) => {
    // Check for Authorization header
    const authHeader = req.header("Authorization");
    if (!authHeader) {
      return res.status(401).json({
        success: false,
        message: "Authorization token required",
      });
    }

    // Extract token from Bearer scheme
    const token = authHeader.replace("Bearer ", "");
    if (!token) {
      return res.status(401).json({
        success: false,
        message: "Invalid token format",
      });
    }

    try {
      // Verify token
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      req.user = decoded;

      // Check if user role is allowed
      if (allowedRoles.length > 0 && !allowedRoles.includes(req.user.role)) {
        return res.status(403).json({
          success: false,
          message: "Insufficient permissions",
        });
      }

      next();
    } catch (err) {
      // Handle different JWT errors specifically
      let message = "Invalid token";
      if (err.name === "TokenExpiredError") {
        message = "Token expired";
      } else if (err.name === "JsonWebTokenError") {
        message = "Malformed token";
      }

      return res.status(401).json({
        success: false,
        message,
      });
    }
  };
};

module.exports = authMiddleware;
