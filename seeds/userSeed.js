require("dotenv").config();
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

// ── Inline schema (hindari import circular) ───────────────
const userSchema = new mongoose.Schema(
  {
    username: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String, required: true },
    role: { type: String, enum: ["owner", "admin"], default: "admin" },
    avatar: { type: String, default: null },
    lastLogin: { type: Date, default: null },
  },
  { timestamps: true }
);

const User = mongoose.model("User", userSchema);

// ── Config owner — ganti sesuai keinginan ─────────────────
const OWNER_USERNAME = "owner";
const OWNER_PASSWORD = "owner123";

const seed = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("✅ MongoDB connected");

    const exists = await User.findOne({ username: OWNER_USERNAME });
    if (exists) {
      console.log(`⚠️  User "${OWNER_USERNAME}" sudah ada, seed dilewati.`);
      process.exit(0);
    }

    const hashed = await bcrypt.hash(OWNER_PASSWORD, 12);

    await User.create({ username: OWNER_USERNAME, password: hashed, role: "owner" });
    console.log(`✅ Owner "${OWNER_USERNAME}" berhasil dibuat.`);

    process.exit(0);
  } catch (err) {
    console.error("❌ Seed gagal:", err.message);
    process.exit(1);
  }
};

seed();