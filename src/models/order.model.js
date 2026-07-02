const mongoose = require("mongoose");
const baseSchemaOptions = require("../config/schemaOptions");
const { ORDER_STATUS } = require("../constants/joki.constants");

// ── Sub-schema: worker yang mengerjakan order ini ─────────
const orderWorkerSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      uppercase: true, // ACIL, JULIO, REZA
    },
    // breakdown rank yang dikerjakan worker ini
    // contoh: { LEGEND: 5, MAWI: 3 }
    rankBreakdown: {
      type: Map,
      of: Number,
      default: {},
    },
    // ── Admin fee (opsional) ──────────────────────────────
    // ID-ID yang diinput admin secara manual, contoh: ["1", "2", "3"]
    // Fee per ID diambil dari Season.adminFee (server-side, admin tidak bisa override)
    adminIds: {
      type: [String],
      default: [],
    },
    // gaji dari job (rankBreakdown × rate) — dihitung otomatis
    jobSalary: {
      type: Number,
      default: 0,
    },
    // total fee admin = adminIds.length × Season.adminFee — dihitung otomatis
    adminFeeTotal: {
      type: Number,
      default: 0,
    },
    // gaji worker untuk order ini = jobSalary + adminFeeTotal — dihitung otomatis
    salary: {
      type: Number,
      default: 0,
    },
    // apakah gaji sudah dibayarkan ke worker
    isPaid: {
      type: Boolean,
      default: false,
    },
    paidAt: {
      type: Date,
      default: null,
    },
  },
  { _id: false },
);

// ── Main schema: Order ────────────────────────────────────
const orderSchema = new mongoose.Schema(
  {
    seasonId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Season",
      required: [true, "Season wajib diisi."],
    },
    // ── Data customer ──────────────────────────────────────
    customerName: {
      type: String,
      required: [true, "Nama customer wajib diisi."],
      trim: true,
    },
    date: {
      type: Date,
      required: [true, "Tanggal order wajib diisi."],
      default: Date.now,
    },
    // kategori: JOKI RANK, JOKI GENDONG, dll
    category: {
      type: String,
      required: [true, "Kategori wajib diisi."],
      trim: true,
      uppercase: true,
    },
    // metode pembayaran: QRIS, BCA, DANA, dll — input manual
    payment: {
      type: String,
      trim: true,
      uppercase: true,
      default: null,
    },
    // harga yang dibayar customer — input manual
    price: {
      type: Number,
      required: [true, "Harga wajib diisi."],
      min: [0, "Harga tidak boleh negatif."],
    },
    // status order
    status: {
      type: String,
      enum: ORDER_STATUS,
      default: "PENDING",
    },
    // ── Worker ────────────────────────────────────────────
    workers: {
      type: [orderWorkerSchema],
      default: [],
    },
    // total gaji semua worker (jobSalary + adminFeeTotal semua worker) — dihitung otomatis
    totalWorkerSalary: {
      type: Number,
      default: 0,
    },
    // profit = price - totalWorkerSalary — dihitung otomatis
    profit: {
      type: Number,
      default: 0,
    },
    // ── Kolom dinamis extra (sesuai extraColumns season) ──
    extraFields: {
      type: Map,
      of: mongoose.Schema.Types.Mixed,
      default: {},
    },
    // snapshot rate yang dipakai saat order dibuat
    // disimpan supaya kalau rate berubah, kalkulasi lama tidak terpengaruh
    rateSnapshot: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  baseSchemaOptions,
);

// ── Index untuk query yang sering dipakai ─────────────────
orderSchema.index({ seasonId: 1, date: -1 });
orderSchema.index({ seasonId: 1, customerName: 1 });
orderSchema.index({ "workers.name": 1 });

module.exports = mongoose.model("Order", orderSchema);