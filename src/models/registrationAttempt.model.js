const mongoose = require("mongoose");

// Catatan percobaan daftar yang gagal (kode salah). Disimpan di DB, bukan di memori,
// karena di Vercel proses bisa mati/ganti kapan saja. Hilang otomatis setelah 15 menit.
const registrationAttemptSchema = new mongoose.Schema({
  telegramId: { type: Number, required: true, index: true },
  createdAt: { type: Date, default: Date.now, expires: 15 * 60 },
});

module.exports = mongoose.model("RegistrationAttempt", registrationAttemptSchema);