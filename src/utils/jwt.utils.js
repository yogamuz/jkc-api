const jwt = require("jsonwebtoken");

const COOKIE_NAME = "joki_token";

/**
 * Generate JWT token dan set ke HttpOnly cookie
 * @param {object} res - Express response object
 * @param {object} payload - Data yang disimpan di token { id, username, role }
 */
const generateTokenAndSetCookie = (res, payload) => {
  const token = jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || "30d",
  });

  const thirtyDays = 30 * 24 * 60 * 60 * 1000;

  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
    domain:
      process.env.NODE_ENV === "production" ? ".jokicalm.store" : undefined,
    maxAge: thirtyDays,
  });

  return token;
};

/**
 * Verify JWT token
 * @param {string} token
 * @returns {object} decoded payload
 */
const verifyToken = (token) => {
  return jwt.verify(token, process.env.JWT_SECRET);
};

/**
 * Clear auth cookie (untuk logout)
 * @param {object} res
 */
const clearAuthCookie = (res) => {
  res.cookie(COOKIE_NAME, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
    domain:
      process.env.NODE_ENV === "production" ? ".jokicalm.store" : undefined,
    maxAge: 0,
  });
};

module.exports = {
  generateTokenAndSetCookie,
  verifyToken,
  clearAuthCookie,
  COOKIE_NAME,
};
