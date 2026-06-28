const express = require("express");
const rateLimit = require("express-rate-limit");
const {
  register, login, logout, getMe, changePassword, uploadAvatar,
  getUsers, createUser, resetUserPassword, deleteUser,
} = require("../controllers/auth.controller");
const { protect, requireRole } = require("../middlewares/auth.middleware");
const upload = require("../config/multer");

const router = express.Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { message: "Terlalu banyak percobaan login. Coba lagi dalam 15 menit." },
  standardHeaders: true,
  legacyHeaders: false,
});

// ── Public ────────────────────────────────────────────────
router.post("/register", register);
router.post("/login", loginLimiter, login);

// ── Protected (semua role) ────────────────────────────────
router.post("/logout", protect, logout);
router.get("/me", protect, getMe);
router.patch("/change-password", protect, changePassword);
router.patch("/avatar", protect, upload.single("avatar"), uploadAvatar);

// ── Owner only ────────────────────────────────────────────
router.get("/users", protect, requireRole("owner"), getUsers);
router.post("/users", protect, requireRole("owner"), createUser);
router.patch("/users/:id/password", protect, requireRole("owner"), resetUserPassword);
router.delete("/users/:id", protect, requireRole("owner"), deleteUser);

module.exports = router;