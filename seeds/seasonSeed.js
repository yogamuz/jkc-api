require("dotenv").config();
const mongoose = require("mongoose");

const seasonSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, unique: true, uppercase: true, trim: true },
    label: { type: String, trim: true },
    isActive: { type: Boolean, default: true },
    extraColumns: { type: Array, default: [] },
    rateHistory: { type: Array, default: [] },
    adminFee: { type: Number, default: 0 },
    startDate: { type: Date, default: null },
    endDate: { type: Date, default: null },
  },
  { timestamps: true }
);

const Season = mongoose.model("Season", seasonSchema);

// ── Data seed dari Excel lo ───────────────────────────────
const seasons = [
  {
    name: "S39",
    label: "Season 39",
    isActive: false,
    rateHistory: [], // S39 tidak ada tabel rate di Excel
    extraColumns: [], // S39 belum ada kolom tambahan
  },
  {
    name: "S40",
    label: "Season 40",
    isActive: false,
    // Rate dari sheet S40 — disimpan sebagai history entry pertama
    rateHistory: [
      {
        effectiveDate: new Date("2026-01-01"),
        note: "Rate awal Season 40",
        rates: [
          { tier: "EPIC",   rate_store_joki: 5000,  rate_store_jokgen: 7000,  rate_worker_joki: 2500, rate_worker_jokgen: 3000 },
          { tier: "LEGEND", rate_store_joki: 6000,  rate_store_jokgen: 8000,  rate_worker_joki: 3500, rate_worker_jokgen: 4000 },
          { tier: "MAWI",   rate_store_joki: 11000, rate_store_jokgen: 14000, rate_worker_joki: 6000, rate_worker_jokgen: 7000 },
          { tier: "HONOR",  rate_store_joki: 13000, rate_store_jokgen: 15000, rate_worker_joki: 7000, rate_worker_jokgen: 8000 },
          { tier: "GLORY",  rate_store_joki: 18000, rate_store_jokgen: 20000, rate_worker_joki: 9000, rate_worker_jokgen: 12000 },
          { tier: "IMO",    rate_store_joki: 24000, rate_store_jokgen: 30000, rate_worker_joki: 14000, rate_worker_jokgen: 20000 },
        ],
      },
    ],
    // Kolom tambahan yang ada di S40 tapi tidak di S39
    extraColumns: [
      { key: "req",    label: "REQ (Tier)",  type: "text",   required: false, order: 0 },
      { key: "worker", label: "Worker",      type: "text",   required: false, order: 1 },
      { key: "status", label: "Status",      type: "select", options: ["PENDING", "DONE", "CANCEL"], required: false, order: 2 },
      { key: "paid",   label: "Paid",        type: "select", options: ["YES", "NO", "NULL"],          required: false, order: 3 },
    ],
  },
  {
    name: "S41",
    label: "Season 41",
    isActive: true,
    rateHistory: [
      {
        effectiveDate: new Date("2026-01-01"),
        note: "Rate awal Season 41",
        rates: [
          { tier: "EPIC",   rate_store_joki: 5000,  rate_store_jokgen: 7000,  rate_worker_joki: 2500, rate_worker_jokgen: 3000 },
          { tier: "LEGEND", rate_store_joki: 6000,  rate_store_jokgen: 8000,  rate_worker_joki: 3500, rate_worker_jokgen: 4000 },
          { tier: "MAWI",   rate_store_joki: 11000, rate_store_jokgen: 14000, rate_worker_joki: 6000, rate_worker_jokgen: 7000 },
          { tier: "HONOR",  rate_store_joki: 13000, rate_store_jokgen: 15000, rate_worker_joki: 7000, rate_worker_jokgen: 8000 },
          { tier: "GLORY",  rate_store_joki: 18000, rate_store_jokgen: 20000, rate_worker_joki: 9000, rate_worker_jokgen: 12000 },
          { tier: "IMO",    rate_store_joki: 24000, rate_store_jokgen: 30000, rate_worker_joki: 14000, rate_worker_jokgen: 20000 },
        ],
      },
    ],
    extraColumns: [
      { key: "req",    label: "REQ (Tier)",  type: "text",   required: false, order: 0 },
      { key: "worker", label: "Worker",      type: "text",   required: false, order: 1 },
      { key: "status", label: "Status",      type: "select", options: ["PENDING", "DONE", "CANCEL"], required: false, order: 2 },
      { key: "paid",   label: "Paid",        type: "select", options: ["YES", "NO", "NULL"],          required: false, order: 3 },
    ],
  },
];

const seed = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("✅ MongoDB connected");

    for (const data of seasons) {
      const exists = await Season.findOne({ name: data.name });
      if (exists) {
        console.log(`⚠️  Season "${data.name}" sudah ada, dilewati.`);
        continue;
      }
      await Season.create(data);
      console.log(`✅ Season "${data.name}" berhasil dibuat.`);
    }

    process.exit(0);
  } catch (err) {
    console.error("❌ Seed gagal:", err.message);
    process.exit(1);
  }
};

seed();