const mongoose = require("mongoose");
const { COLUMN_TYPES } = require("../constants/joki.constants");

// ── Sub-schema: satu kolom dinamis ───────────────────────
const columnSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      required: true,
      trim: true,
      // key dipakai sebagai field name, tidak boleh ada spasi
      match: [
        /^[a-zA-Z0-9_]+$/,
        "Key hanya boleh huruf, angka, dan underscore",
      ],
    },
    label: {
      type: String,
      required: true,
      trim: true,
    },
    type: {
      type: String,
      enum: COLUMN_TYPES,
      default: "text",
    },
    // untuk type "select" — isi pilihannya
    options: {
      type: [String],
      default: [],
    },
    required: {
      type: Boolean,
      default: false,
    },
    // urutan tampil di tabel
    order: {
      type: Number,
      default: 0,
    },
  },
  { _id: false },
);

// ── Sub-schema: rate per tier ─────────────────────────────
const rateSchema = new mongoose.Schema(
  {
    tier: { type: String, required: true, uppercase: true, trim: true },
    rate_store_joki: { type: Number, default: 0 },
    rate_store_jokgen: { type: Number, default: 0 },
    rate_worker_joki: { type: Number, default: 0 },
    rate_worker_jokgen: { type: Number, default: 0 },
  },
  { _id: false },
);
// ── Sub-schema: snapshot rate pada tanggal tertentu ───────
// Setiap kali rate diupdate, entry baru di-push ke rateHistory
// Sistem cari entry dengan effectiveDate <= tanggal order
const rateHistorySchema = new mongoose.Schema(
  {
    effectiveDate: { type: Date, required: true },
    rates: { type: [rateSchema], default: [] },
    note: { type: String, default: "" }, // opsional — catatan kenapa rate berubah
  },
  { _id: false },
);

// ── Main schema: Season ───────────────────────────────────
const seasonSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Nama season wajib diisi"],
      unique: true,
      trim: true,
      uppercase: true, // S39, S40, S41
    },
    label: {
      type: String,
      trim: true, // "Season 39" — label yang lebih ramah
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    // Kolom dinamis tambahan (di luar kolom default)
    extraColumns: {
      type: [columnSchema],
      default: [],
    },
    // History rate — setiap update rate push entry baru, tidak replace
    rateHistory: {
      type: [rateHistorySchema],
      default: [],
    },
    // Admin fee (flat atau %) — opsional
    adminFee: {
      type: Number,
      default: 0,
    },
    startDate: {
      type: Date,
      default: null,
    },
    endDate: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform(doc, ret) {
        delete ret._id;
        delete ret.__v;
      },
    },
  },
);

module.exports = mongoose.model("Season", seasonSchema);
