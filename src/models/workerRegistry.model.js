const mongoose = require("mongoose");

// Daftar worker resmi. Orang hanya bisa jadi worker di bot kalau namanya ada di sini
// dan dia membuktikan identitasnya lewat kode sekali pakai.
const workerRegistrySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Nama worker wajib diisi."],
      unique: true,
      trim: true,
      uppercase: true, // ACIL, CUPIL
      maxlength: [30, "Nama worker maksimal 30 karakter."],
    },
    isActive: { type: Boolean, default: true },

    // Diisi setelah worker berhasil verifikasi di bot. Pakai ID angka Telegram
    // (permanen), bukan username/nama akun yang bisa diganti siapa saja.
    telegramId: { type: Number },
    telegramUsername: { type: String, default: null },
    verifiedAt: { type: Date, default: null },

    // Kode daftar sekali pakai. Yang disimpan hash-nya + seed (supaya kode yang
    // masih berlaku bisa ditampilkan lagi tanpa menyimpan kode aslinya).
    inviteCodeHash: { type: String, select: false },
    inviteSeed: { type: String, select: false },
    inviteExpiresAt: { type: Date },

    // Link grup terakhir yang dibuatkan bot untuk worker ini (supaya bisa di-revoke)
    groupInviteLink: { type: String, select: false },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform(doc, ret) {
        delete ret._id;
        delete ret.__v;
        delete ret.inviteCodeHash;
        delete ret.inviteSeed;
        delete ret.groupInviteLink;
      },
    },
  },
);

// Satu akun Telegram hanya boleh terikat ke satu worker
workerRegistrySchema.index(
  { telegramId: 1 },
  { unique: true, partialFilterExpression: { telegramId: { $type: "number" } } },
);
// Jaga-jaga kalau dua kode menghasilkan hash yang sama
workerRegistrySchema.index(
  { inviteCodeHash: 1 },
  {
    unique: true,
    partialFilterExpression: { inviteCodeHash: { $type: "string" } },
  },
);

workerRegistrySchema.virtual("isVerified").get(function () {
  return typeof this.telegramId === "number";
});

workerRegistrySchema.virtual("hasPendingInvite").get(function () {
  return !!this.inviteExpiresAt && this.inviteExpiresAt > new Date();
});

module.exports = mongoose.model("WorkerRegistry", workerRegistrySchema);