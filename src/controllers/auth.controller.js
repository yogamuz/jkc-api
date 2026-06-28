const User = require("../models/user.model");
const { generateTokenAndSetCookie, clearAuthCookie } = require("../utils/jwt.utils");
const cloudinary = require("../config/cloudinary");

const register = async (req, res, next) => {
  try {
    if (process.env.DISABLE_REGISTER === "true") {
      return res.status(403).json({ message: "Registrasi sudah dinonaktifkan." });
    }
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ message: "Username dan password wajib diisi." });
    }
    const exists = await User.findOne({ username: username.toLowerCase() });
    if (exists) return res.status(400).json({ message: "Username sudah digunakan." });
    const user = await User.create({ username, password, role: "owner" });
    const payload = { id: user._id, username: user.username, role: user.role };
    generateTokenAndSetCookie(res, payload);
    res.status(201).json({
      message: "Akun berhasil dibuat.",
      user: { id: user._id, username: user.username, role: user.role, avatar: user.avatar },
    });
  } catch (err) {
    next(err);
  }
};

const login = async (req, res, next) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ message: "Username dan password wajib diisi." });
    }
    const user = await User.findOne({ username: username.toLowerCase() }).select("+password");
    if (!user) return res.status(401).json({ message: "Username atau password salah." });
    const isMatch = await user.comparePassword(password);
    if (!isMatch) return res.status(401).json({ message: "Username atau password salah." });
    user.lastLogin = new Date();
    await user.save({ validateBeforeSave: false });
    const payload = { id: user._id, username: user.username, role: user.role };
    generateTokenAndSetCookie(res, payload);
    res.json({
      message: "Login berhasil.",
      user: { id: user._id, username: user.username, role: user.role, avatar: user.avatar, lastLogin: user.lastLogin },
    });
  } catch (err) {
    next(err);
  }
};

const logout = (req, res) => {
  clearAuthCookie(res);
  res.json({ message: "Logout berhasil." });
};

const getMe = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: "User tidak ditemukan." });
    res.json({
      user: { id: user._id, username: user.username, role: user.role, avatar: user.avatar, lastLogin: user.lastLogin, createdAt: user.createdAt },
    });
  } catch (err) {
    next(err);
  }
};

const changePassword = async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ message: "Password lama dan baru wajib diisi." });
    }
    if (newPassword.length < 6) {
      return res.status(400).json({ message: "Password baru minimal 6 karakter." });
    }
    const user = await User.findById(req.user.id).select("+password");
    const isMatch = await user.comparePassword(currentPassword);
    if (!isMatch) return res.status(401).json({ message: "Password lama salah." });
    user.password = newPassword;
    await user.save();
    clearAuthCookie(res);
    res.json({ message: "Password berhasil diubah. Silakan login ulang." });
  } catch (err) {
    next(err);
  }
};

// ── Avatar Upload ─────────────────────────────────────────
// PATCH /api/auth/avatar
const uploadAvatar = async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "File gambar wajib diupload." });
    }

    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: "User tidak ditemukan." });

    // Hapus avatar lama
    if (user.avatar) {
      const parts = user.avatar.split("/");
      const filename = parts[parts.length - 1].split(".")[0];
      const publicId = `jokicalm/avatars/${filename}`;
      await cloudinary.uploader.destroy(publicId).catch(() => {});
    }

    // Upload buffer ke cloudinary via stream
    const uploadResult = await new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          folder: "jokicalm/avatars",
          transformation: [{ width: 200, height: 200, crop: "fill", gravity: "face" }],
        },
        (error, result) => {
          if (error) reject(error);
          else resolve(result);
        }
      );
      stream.end(req.file.buffer);
    });

    user.avatar = uploadResult.secure_url;
    await user.save({ validateBeforeSave: false });

    res.json({ message: "Avatar berhasil diupload.", avatar: user.avatar });
  } catch (err) {
    next(err);
  }
};

// ── User Management (owner only) ─────────────────────────

const getUsers = async (req, res, next) => {
  try {
    const users = await User.find().select("-password");
    res.json({ users });
  } catch (err) {
    next(err);
  }
};

const createUser = async (req, res, next) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ message: "Username dan password wajib diisi." });
    }
    const exists = await User.findOne({ username: username.toLowerCase() });
    if (exists) return res.status(400).json({ message: "Username sudah digunakan." });
    const user = await User.create({ username, password, role: "admin" });
    res.status(201).json({
      message: "Akun admin berhasil dibuat.",
      user: { id: user._id, username: user.username, role: user.role, avatar: user.avatar },
    });
  } catch (err) {
    next(err);
  }
};

const resetUserPassword = async (req, res, next) => {
  try {
    const { newPassword } = req.body;
    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({ message: "Password baru minimal 6 karakter." });
    }
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: "User tidak ditemukan." });
    if (user.role === "owner") {
      return res.status(403).json({ message: "Password owner tidak bisa diubah dari sini." });
    }
    user.password = newPassword;
    await user.save();
    res.json({ message: "Password berhasil direset." });
  } catch (err) {
    next(err);
  }
};

const deleteUser = async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: "User tidak ditemukan." });
    if (user.role === "owner") {
      return res.status(403).json({ message: "Akun owner tidak bisa dihapus." });
    }
    await user.deleteOne();
    res.json({ message: "Akun admin berhasil dihapus." });
  } catch (err) {
    next(err);
  }
};

module.exports = { register, login, logout, getMe, changePassword, uploadAvatar, getUsers, createUser, resetUserPassword, deleteUser };