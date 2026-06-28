const { verifyToken, COOKIE_NAME } = require("../utils/jwt.utils");

/**
 * Middleware: wajib login
 * Attach req.user = { id, username, role } jika valid
 */
const protect = async (req, res, next) => {
  try {
    const token = req.cookies[COOKIE_NAME];

    if (!token) {
      return res
        .status(401)
        .json({ message: "Sesi tidak ditemukan. Silakan login." });
    }

    const decoded = verifyToken(token);

    const User = require("../models/user.model");
    const user = await User.findById(decoded.id).select("passwordChangedAt");
    if (!user) {
      return res.status(401).json({ message: "User tidak ditemukan." });
    }
    if (user.passwordChangedAt) {
      const changedAt = Math.floor(user.passwordChangedAt.getTime() / 1000);
      if (decoded.iat < changedAt) {
        return res
          .status(401)
          .json({ message: "Password telah diubah. Silakan login ulang." });
      }
    }

    req.user = decoded;
    next();
  } catch (err) {
    // TokenExpiredError atau JsonWebTokenError
    return res
      .status(401)
      .json({
        message: "Sesi tidak valid atau sudah expired. Silakan login ulang.",
      });
  }
};

/**
 * Middleware: role-based access
 * Contoh pemakaian: router.delete("/...", protect, requireRole("admin"), handler)
 * @param {...string} roles
 */
const requireRole = (...roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user?.role)) {
      return res
        .status(403)
        .json({ message: "Akses ditolak. Role tidak diizinkan." });
    }
    next();
  };
};

module.exports = { protect, requireRole };
