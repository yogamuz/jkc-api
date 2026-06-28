/**
 * Global error handler — taruh paling bawah di index.js
 * Tangkap semua error yang di-pass lewat next(err)
 */
const errorHandler = (err, req, res, next) => {
  console.error(`[ERROR] ${req.method} ${req.path}:`, err.message);

  // Mongoose validation error
  if (err.name === "ValidationError") {
    const messages = Object.values(err.errors).map((e) => e.message);
    return res.status(400).json({ message: messages.join(". ") });
  }

  // Mongoose duplicate key (unique constraint)
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue)[0];
    return res.status(400).json({ message: `${field} sudah digunakan.` });
  }

  // JWT errors (sudah ditangani di middleware, tapi jaga-jaga)
  if (err.name === "JsonWebTokenError" || err.name === "TokenExpiredError") {
    return res.status(401).json({ message: "Token tidak valid." });
  }

  // Default 500
  res.status(err.statusCode || 500).json({
    message: err.message || "Terjadi kesalahan pada server.",
    ...(process.env.NODE_ENV === "development" && { stack: err.stack }),
  });
};

module.exports = { errorHandler };