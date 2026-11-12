const crypto = require("crypto");
const { Api } = require("grammy");
const WorkerRegistry = require("../models/workerRegistry.model");
const RegistrationAttempt = require("../models/registrationAttempt.model");
const Order = require("../models/order.model");
const Season = require("../models/season.model");
const orderService = require("./order.service");
const { logAction } = require("./auditLog.service");

// Tanpa I, L, O, 0, 1 supaya tidak salah baca/ketik
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 8;
const MAX_FAILED_ATTEMPTS = 5; // per akun Telegram, per 15 menit

const fail = (message, statusCode) => {
  const e = new Error(message);
  e.statusCode = statusCode;
  return e;
};

// ── Helper kode ──────────────────────────────────────────────
// Masa berlaku kode (menit). Default 15. Atur lewat WORKER_INVITE_TTL_MINUTES.
const inviteTtlMs = () => {
  const m = Number(process.env.WORKER_INVITE_TTL_MINUTES);
  return (m > 0 ? m : 15) * 60 * 1000;
};

const generateSeed = () => crypto.randomBytes(16).toString("hex");

// Kode diturunkan dari seed + JWT_SECRET, jadi bisa ditampilkan lagi
// tanpa menyimpan kode aslinya di database.
const codeFromSeed = (seed) => {
  const bytes = crypto
    .createHmac("sha256", process.env.JWT_SECRET || "")
    .update(`invite:${seed}`)
    .digest();
  return Array.from(
    { length: CODE_LENGTH },
    (_, i) => CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length],
  ).join("");
};

const normalizeCode = (raw) =>
  String(raw || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");

const hashCode = (code) =>
  crypto
    .createHmac("sha256", process.env.JWT_SECRET || "")
    .update(code)
    .digest("hex");

const normalizeName = (n) =>
  String(n || "")
    .trim()
    .replace(/\s+/g, " ")
    .toUpperCase();

const NAME_REGEX = /^[A-Z0-9][A-Z0-9 _.-]*$/;

const inviteResult = (code, expiresAt, reused) => {
  const username = String(process.env.TELEGRAM_BOT_USERNAME || "").replace(
    /^@/,
    "",
  );
  return {
    code,
    expiresAt,
    reused,
    link: username ? `https://t.me/${username}?start=${code}` : null,
  };
};

// ── CRUD (dipakai web, owner only) ───────────────────────────
const listWorkers = async () => WorkerRegistry.find().sort({ name: 1 });

const createWorker = async (name, performedBy = null) => {
  const clean = normalizeName(name);
  if (clean.length < 2 || clean.length > 30)
    throw fail("Nama worker harus 2-30 karakter.", 400);
  if (!NAME_REGEX.test(clean))
    throw fail("Nama worker hanya boleh huruf, angka, spasi, titik, - dan _.", 400);

  if (await WorkerRegistry.findOne({ name: clean }))
    throw fail(`Worker "${clean}" sudah ada.`, 409);

  const worker = await WorkerRegistry.create({ name: clean });
  await logAction({
    action: "CREATE",
    entityType: "Worker",
    entityId: worker._id,
    changes: null,
    performedBy,
  });
  return worker;
};

// Ambil nama worker yang sudah pernah dipakai di order lama ke daftar resmi
const importFromOrders = async () => {
  const names = await Order.distinct("workers.name");
  const clean = [
    ...new Set(names.map(normalizeName).filter((n) => n && n.length <= 30)),
  ];
  const existing = new Set(
    (await WorkerRegistry.find({ name: { $in: clean } }).select("name")).map(
      (w) => w.name,
    ),
  );
  const toAdd = clean.filter((n) => !existing.has(n));
  if (toAdd.length > 0)
    await WorkerRegistry.insertMany(
      toAdd.map((name) => ({ name })),
      { ordered: false },
    );
  return { added: toAdd, alreadyExisted: existing.size };
};

// Buat kode daftar. Kalau kode lama masih berlaku, tampilkan kode yang sama
// (tanpa tulis DB dan tanpa audit log). Kode baru dibuat hanya setelah kedaluwarsa.
const generateInvite = async (id, performedBy = null) => {
  const worker = await WorkerRegistry.findById(id).select("+inviteSeed");
  if (!worker) throw fail("Worker tidak ditemukan.", 404);
  if (!worker.isActive)
    throw fail("Worker nonaktif. Aktifkan dulu sebelum membuat kode.", 409);
  if (worker.isVerified)
    throw fail(
      "Worker sudah terverifikasi. Reset dulu kalau mau daftar ulang.",
      409,
    );

  if (worker.inviteSeed && worker.inviteExpiresAt > new Date())
    return inviteResult(
      codeFromSeed(worker.inviteSeed),
      worker.inviteExpiresAt,
      true,
    );

  const now = new Date();
  const expiresAt = new Date(now.getTime() + inviteTtlMs());

  for (let i = 0; i < 3; i++) {
    const seed = generateSeed();
    const code = codeFromSeed(seed);
    try {
      // Atomik: hanya menulis kalau belum ada kode yang masih berlaku
      const res = await WorkerRegistry.updateOne(
        {
          _id: worker._id,
          $or: [
            { inviteSeed: { $exists: false } },
            { inviteExpiresAt: { $not: { $gt: now } } },
          ],
        },
        {
          $set: {
            inviteSeed: seed,
            inviteCodeHash: hashCode(code),
            inviteExpiresAt: expiresAt,
          },
        },
      );

      if (res.matchedCount === 0) {
        // klik bersamaan: sudah ada yang membuat kode lebih dulu, pakai punyanya
        const cur = await WorkerRegistry.findById(id).select("+inviteSeed");
        if (cur?.inviteSeed && cur.inviteExpiresAt > new Date())
          return inviteResult(
            codeFromSeed(cur.inviteSeed),
            cur.inviteExpiresAt,
            true,
          );
        continue;
      }

      await logAction({
        action: "UPDATE",
        entityType: "Worker",
        entityId: worker._id,
        changes: { inviteGenerated: { workerName: worker.name, expiresAt } },
        performedBy,
      });
      return inviteResult(code, expiresAt, false);
    } catch (err) {
      if (err.code !== 11000) throw err; // hash kembar, coba seed lain
    }
  }
  throw fail("Gagal membuat kode. Coba lagi.", 500);
};

// Keluarkan akun dari grup drop job (kick tanpa ban permanen). Best effort.
const removeFromGroup = async (telegramId) => {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const groupId = process.env.TELEGRAM_GROUP_ID;
  if (!token || !groupId || typeof telegramId !== "number") return false;
  const api = new Api(token);
  try {
    await api.banChatMember(Number(groupId), telegramId);
  } catch (err) {
    console.error("[WORKER] gagal kick dari grup:", err.message);
    return false;
  }
  await api
    .unbanChatMember(Number(groupId), telegramId, { only_if_banned: true })
    .catch((err) => console.error("[WORKER] gagal unban:", err.message));
  return true;
};

const resetWorker = async (id, performedBy = null) => {
  const worker = await WorkerRegistry.findById(id);
  if (!worker) throw fail("Worker tidak ditemukan.", 404);
  const prevTelegramId = worker.telegramId;

  const updated = await WorkerRegistry.findByIdAndUpdate(
    id,
    {
      $unset: {
        telegramId: 1,
        inviteCodeHash: 1,
        inviteSeed: 1,
        inviteExpiresAt: 1,
      },
      $set: { telegramUsername: null, verifiedAt: null, groupInviteLink: null },
    },
    { new: true },
  );

  if (typeof prevTelegramId === "number") await removeFromGroup(prevTelegramId);

  await logAction({
    action: "UPDATE",
    entityType: "Worker",
    entityId: worker._id,
    changes: { telegramReset: { workerName: worker.name } },
    performedBy,
  });
  return updated;
};

const setActive = async (id, isActive, performedBy = null) => {
  const worker = await WorkerRegistry.findById(id);
  if (!worker) throw fail("Worker tidak ditemukan.", 404);
  if (worker.isActive === isActive) return worker;

  const update = { $set: { isActive } };
  if (!isActive)
    update.$unset = { inviteCodeHash: 1, inviteSeed: 1, inviteExpiresAt: 1 };
  const updated = await WorkerRegistry.findByIdAndUpdate(id, update, {
    new: true,
  });

  if (!isActive && typeof worker.telegramId === "number")
    await removeFromGroup(worker.telegramId);

  await logAction({
    action: "UPDATE",
    entityType: "Worker",
    entityId: worker._id,
    changes: { isActive: { from: worker.isActive, to: isActive } },
    performedBy,
  });
  return updated;
};

const deleteWorker = async (id, performedBy = null) => {
  const worker = await WorkerRegistry.findById(id);
  if (!worker) throw fail("Worker tidak ditemukan.", 404);

  if (typeof worker.telegramId === "number")
    await removeFromGroup(worker.telegramId);

  await logAction({
    action: "DELETE",
    entityType: "Worker",
    entityId: worker._id,
    changes: null,
    performedBy,
  });
  await worker.deleteOne();
  return { message: `Worker "${worker.name}" berhasil dihapus.` };
};

// ── Dipakai bot Telegram ─────────────────────────────────────
const getActiveByTelegramId = async (telegramId) =>
  WorkerRegistry.findOne({ telegramId, isActive: true });

const getByTelegramId = async (telegramId) =>
  WorkerRegistry.findOne({ telegramId });

const registerByCode = async (from, rawCode) => {
  const telegramId = from.id;

  const existing = await WorkerRegistry.findOne({ telegramId });
  if (existing) return { status: "already", worker: existing };

  const failures = await RegistrationAttempt.countDocuments({ telegramId });
  if (failures >= MAX_FAILED_ATTEMPTS) return { status: "blocked" };

  const code = normalizeCode(rawCode);
  if (code.length !== CODE_LENGTH) {
    await RegistrationAttempt.create({ telegramId });
    return { status: "invalid" };
  }

  try {
    // Atomik: kode hanya bisa dipakai sekali, oleh akun yang belum terikat
    const worker = await WorkerRegistry.findOneAndUpdate(
      {
        inviteCodeHash: hashCode(code),
        inviteExpiresAt: { $gt: new Date() },
        isActive: true,
        telegramId: { $exists: false },
      },
      {
        $set: {
          telegramId,
          telegramUsername: from.username || null,
          verifiedAt: new Date(),
        },
        $unset: { inviteCodeHash: 1, inviteSeed: 1, inviteExpiresAt: 1 },
      },
      { new: true },
    );

    if (!worker) {
      await RegistrationAttempt.create({ telegramId });
      return { status: "invalid" };
    }

    await logAction({
      action: "UPDATE",
      entityType: "Worker",
      entityId: worker._id,
      changes: {
        verified: {
          workerName: worker.name,
          telegramId,
          username: from.username || null,
          via: "telegram",
        },
      },
      performedBy: null,
    });
    return { status: "ok", worker };
  } catch (err) {
    if (err.code === 11000)
      return { status: "already", worker: await getByTelegramId(telegramId) };
    throw err;
  }
};

const getStoredGroupLink = async (id) => {
  const w = await WorkerRegistry.findById(id).select("+groupInviteLink");
  return w?.groupInviteLink || null;
};

const saveGroupLink = async (id, link) =>
  WorkerRegistry.updateOne({ _id: id }, { $set: { groupInviteLink: link } });

/**
 * Ringkasan untuk worker itu sendiri (dipakai /summary di bot).
 * Pakai ulang getWorkerDetail & getAdminDetail yang sudah ada, tidak mengubahnya.
 * Default: season aktif. allSeasons=true: semua season.
 */
const getSelfSummary = async (workerName, { allSeasons = false } = {}) => {
  const season = await Season.findOne({ isActive: true })
    .sort({ createdAt: -1 })
    .select("name adminFee");
  const useAll = allSeasons || !season;
  const seasonId = useAll ? null : String(season._id);

  const [jobs, ids] = await Promise.all([
    orderService.getWorkerDetail(workerName, seasonId),
    orderService.getAdminDetail(workerName, seasonId),
  ]);

  const job = jobs.history.reduce(
    (acc, h) => {
      acc.total += h.jobSalary || 0;
      if (h.isPaid) acc.paid += h.jobSalary || 0;
      else acc.unpaid += h.jobSalary || 0;
      return acc;
    },
    { count: jobs.totalOrders, total: 0, paid: 0, unpaid: 0 },
  );

  // ID (customer) yang belum cair: gaji job + fee ID admin yang belum dibayar, digabung per order
  const unpaidMap = new Map();
  const addUnpaid = (h, amount) => {
    if (!amount) return;
    const key = String(h.orderId);
    const cur = unpaidMap.get(key) || {
      seasonName: h.seasonName,
      customerName: h.customerName,
      amount: 0,
    };
    cur.amount += amount;
    unpaidMap.set(key, cur);
  };
  jobs.history.forEach((h) => {
    if (!h.isPaid) addUnpaid(h, h.jobSalary || 0);
  });
  ids.history.forEach((h) => {
    if (!h.isAdminFeePaid) addUnpaid(h, h.adminFeeTotal || 0);
  });
  const unpaidList = [...unpaidMap.values()];

  return {
    scope: useAll ? "SEMUA SEASON" : season.name,
    scopeAll: useAll,
    job,
    ids: {
      feeTotal: ids.totalEarned,
      feePaid: ids.totalPaid,
      feeUnpaid: ids.totalUnpaid,
    },
    unpaid: { count: unpaidList.length, list: unpaidList },
  };
};

module.exports = {
  listWorkers,
  createWorker,
  importFromOrders,
  generateInvite,
  resetWorker,
  setActive,
  deleteWorker,
  removeFromGroup,
  getActiveByTelegramId,
  getByTelegramId,
  registerByCode,
  getStoredGroupLink,
  saveGroupLink,
  getSelfSummary,
};