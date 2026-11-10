const Order = require("../models/order.model");
const Season = require("../models/season.model");
const { getRateByDate, calculateWorkerSalary } = require("./season.service");
const { logAction, diffFields } = require("./auditLog.service");

const WIB_OFFSET_MS = 7 * 60 * 60 * 1000;

// "2026-11-02" -> awal/akhir hari WIB. Selain format itu, parse biasa.
const parseBoundary = (val, endOfDay = false) =>
  /^\d{4}-\d{2}-\d{2}$/.test(val)
    ? new Date(`${val}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}+07:00`)
    : new Date(val);
// ── Helper: hitung jobSalary, adminFeeTotal, dan salary total untuk 1 worker ──
// adminFeePerId SELALU diambil dari Season (server-side), tidak pernah dari input client.
const buildWorker = (w, rates, category, adminFeePerId) => {
  const hasCustomSalary =
    w.customSalary !== undefined &&
    w.customSalary !== null &&
    w.customSalary !== "" &&
    !isNaN(Number(w.customSalary));

  const jobSalary = hasCustomSalary
    ? Number(w.customSalary)
    : rates
      ? calculateWorkerSalary(rates, w.rankBreakdown || {}, category)
      : 0;

  const adminIds = Array.isArray(w.adminIds)
    ? w.adminIds.map((id) => String(id).trim()).filter(Boolean)
    : [];
  const adminFeeTotal = adminIds.length * (adminFeePerId || 0);

  return {
    name: w.name.toUpperCase(),
    rankBreakdown: w.rankBreakdown || {},
    bonusBreakdown: w.bonusBreakdown || {},
    customSalary: hasCustomSalary ? Number(w.customSalary) : null,
    adminIds,
    jobSalary,
    adminFeeTotal,
    salary: jobSalary + adminFeeTotal,
    isPaid: w.isPaid || false,
    paidAt: w.paidAt || null,
    isAdminFeePaid: w.isAdminFeePaid || false,
    adminFeePaidAt: w.adminFeePaidAt || null,
  };
};
const toPlain = (m) => (m instanceof Map ? Object.fromEntries(m) : m || {});

// Rank/bonus/gaji untuk job yang belum punya worker
const buildPendingJob = (p, rates, category) => {
  const empty = {
    rankBreakdown: {},
    bonusBreakdown: {},
    customSalary: null,
    salary: 0,
  };
  if (!p) return empty;
  const rankBreakdown = toPlain(p.rankBreakdown);
  const bonusBreakdown = toPlain(p.bonusBreakdown);
  const hasCustom =
    p.customSalary !== undefined &&
    p.customSalary !== null &&
    p.customSalary !== "" &&
    !isNaN(Number(p.customSalary));
  const salary = hasCustom
    ? Number(p.customSalary)
    : rates
      ? calculateWorkerSalary(rates, rankBreakdown, category)
      : 0;
  return {
    rankBreakdown,
    bonusBreakdown,
    customSalary: hasCustom ? Number(p.customSalary) : null,
    salary,
  };
};

/**
 * Ambil semua order per season
 * Support filter: workerName, status, dateFrom, dateTo
 */
const getOrdersBySeason = async (seasonId, filters = {}) => {
  const query = { seasonId };

  if (filters.status) query.status = filters.status;
  if (filters.workerName) {
    query["workers.name"] = filters.workerName.toUpperCase();
  }
  if (filters.dateFrom || filters.dateTo) {
    query.date = {};
    if (filters.dateFrom) query.date.$gte = parseBoundary(filters.dateFrom);
    if (filters.dateTo) query.date.$lte = parseBoundary(filters.dateTo, true);
  }
  return Order.find(query)
    .populate("createdBy", "avatar username")
    .populate("updatedBy", "avatar username")
    .sort({ date: -1 });
};

/**
 * Ambil satu order by ID
 */
const getOrderById = async (id) => {
  const order = await Order.findById(id);
  if (!order) throw new Error("Order tidak ditemukan.");
  return order;
};

/**
 * Buat order baru
 * - Auto kalkulasi jobSalary worker dari rankBreakdown × rate tanggal order
 * - Auto kalkulasi adminFeeTotal dari adminIds.length × Season.adminFee (server-side)
 * - Auto hitung totalWorkerSalary dan profit
 */
const createOrder = async (data) => {
  const {
    seasonId,
    customerName,
    date,
    category,
    payment,
    price,
    status,
    keterangan,
    workers = [],
    extraFields = {},
  } = data;

  // ambil season beserta rateHistory & adminFee
  const season = await Season.findById(seasonId);
  if (!season) throw new Error("Season tidak ditemukan.");

  // tanggal order — default hari ini
  const orderDate = date ? new Date(date) : new Date();

  // ambil rate yang berlaku pada tanggal order
  const rates = getRateByDate(season, orderDate);

  // fee per ID admin — HANYA dari Season, tidak pernah dari body request
  const adminFeePerId = season.adminFee || 0;

  // hitung salary tiap worker (job + admin fee)
  const processedWorkers = workers.map((w) =>
    buildWorker(w, rates, category, adminFeePerId),
  );

  const calculatedSalary = processedWorkers.reduce(
    (sum, w) => sum + w.salary,
    0,
  );

  // belum ada worker: rank/bonus/gaji disimpan di pendingJob
  const pendingJob = buildPendingJob(
    processedWorkers.length === 0 ? data.pendingJob : null,
    rates,
    category,
  );

  const totalWorkerSalary =
    calculatedSalary > 0
      ? calculatedSalary
      : pendingJob.salary || data.totalWorkerSalary || 0;

  // Kalau pakai fallback dari Excel, distribute salary ke worker pertama agar tercatat
  if (
    calculatedSalary === 0 &&
    totalWorkerSalary > 0 &&
    processedWorkers.length > 0
  ) {
    processedWorkers[0].jobSalary = totalWorkerSalary;
    processedWorkers[0].salary = totalWorkerSalary;
  }

  const profit = price - totalWorkerSalary;

  const order = await Order.create({
    seasonId,
    customerName: customerName.trim(),
    date: orderDate,
    category: category.trim().toUpperCase(),
    payment: payment ? payment.trim().toUpperCase() : null,
    price,
    status: status || "PENDING",
    keterangan: keterangan ? String(keterangan).trim() : "",
    workers: processedWorkers,
    pendingJob,
    totalWorkerSalary,
    profit,
    extraFields,
    rateSnapshot: rates ? { ...rates, adminFeePerId } : { adminFeePerId },
    createdBy: data.createdBy || null,
    updatedBy: data.createdBy || null,
  });

  await logAction({
    action: "CREATE",
    entityType: "Order",
    entityId: order._id,
    changes: null,
    performedBy: data.createdBy || null,
  });

  return order;
};

/**
 * Update order
 * Jika workers atau category berubah, hitung ulang salary (termasuk admin fee)
 */
const updateOrder = async (id, data) => {
  const order = await Order.findById(id);
  if (!order) throw new Error("Order tidak ditemukan.");
  const before = order.toObject();

  const needsRecalc =
    data.workers !== undefined ||
    data.category !== undefined ||
    data.price !== undefined;

  // update field dasar
  const allowedFields = [
    "customerName",
    "date",
    "category",
    "payment",
    "price",
    "status",
    "keterangan",
    "extraFields",
  ];
  allowedFields.forEach((key) => {
    if (data.updatedBy) order.updatedBy = data.updatedBy;
    if (data[key] !== undefined) order[key] = data[key];
  });

  // recalc salary kalau ada perubahan yang relevan
  if (needsRecalc) {
    const season = await Season.findById(order.seasonId);
    const rates = getRateByDate(season, order.date);
    const category = data.category || order.category;
    const adminFeePerId = season?.adminFee || 0;

    if (data.workers) {
      const prevByName = new Map(order.workers.map((w) => [w.name, w]));
      order.workers = data.workers.map((w) => {
        const prev = prevByName.get(String(w.name).toUpperCase());
        return buildWorker(
          {
            ...w,
            adminIds: w.adminIds !== undefined ? w.adminIds : prev?.adminIds,
            isAdminFeePaid: w.isAdminFeePaid ?? prev?.isAdminFeePaid,
            adminFeePaidAt: w.adminFeePaidAt ?? prev?.adminFeePaidAt,
          },
          rates,
          category,
          adminFeePerId,
        );
      });
    }

    // belum ada worker: pakai pendingJob. Sudah ada worker: pendingJob dikosongkan
    if (order.workers.length === 0) {
      order.pendingJob = buildPendingJob(
        data.pendingJob !== undefined ? data.pendingJob : order.pendingJob,
        rates,
        category,
      );
    } else {
      order.pendingJob = buildPendingJob(null, rates, category);
    }

    order.totalWorkerSalary =
      order.workers.length > 0
        ? order.workers.reduce((sum, w) => sum + w.salary, 0)
        : order.pendingJob.salary;
    order.profit = order.price - order.totalWorkerSalary;
    order.rateSnapshot = rates
      ? { ...rates, adminFeePerId }
      : { adminFeePerId };
  }

  await order.save();
  const changes = diffFields(before, order.toObject(), [
    "customerName",
    "date",
    "category",
    "payment",
    "price",
    "status",
    "totalWorkerSalary",
    "profit",
  ]);
  await logAction({
    action: "UPDATE",
    entityType: "Order",
    entityId: order._id,
    changes,
    performedBy: data.updatedBy || null,
  });
  return order;
};

/**
 * Mark gaji worker sebagai PAID / UNPAID
 * workerName: nama worker yang mau di-mark
 * isPaid: true / false
 */
const markWorkerPaid = async (
  orderId,
  workerName,
  isPaid,
  updatedBy = null,
) => {
  const order = await Order.findById(orderId);
  if (!order) throw new Error("Order tidak ditemukan.");

  const worker = order.workers.find((w) => w.name === workerName.toUpperCase());
  if (!worker)
    throw new Error(`Worker "${workerName}" tidak ditemukan di order ini.`);

  worker.isPaid = isPaid;
  worker.paidAt = isPaid ? new Date() : null;
  if (updatedBy) order.updatedBy = updatedBy;

  await order.save();
  await logAction({
    action: "UPDATE",
    entityType: "Order",
    entityId: order._id,
    changes: { workerSalaryPaid: { workerName: worker.name, isPaid } },
    performedBy: updatedBy || null,
  });
  return order;
};

/**
 * Mark fee admin (bukan job salary) sebagai PAID / UNPAID
 */
const markAdminFeePaid = async (
  orderId,
  workerName,
  isPaid,
  updatedBy = null,
) => {
  const order = await Order.findById(orderId);
  if (!order) throw new Error("Order tidak ditemukan.");

  const worker = order.workers.find((w) => w.name === workerName.toUpperCase());
  if (!worker)
    throw new Error(`Worker "${workerName}" tidak ditemukan di order ini.`);

  worker.isAdminFeePaid = isPaid;
  worker.adminFeePaidAt = isPaid ? new Date() : null;
  if (updatedBy) order.updatedBy = updatedBy;

  await order.save();

  await logAction({
    action: "UPDATE",
    entityType: "Order",
    entityId: order._id,
    changes: { adminFeePaid: { workerName: worker.name, isPaid } },
    performedBy: updatedBy || null,
  });

  return order;
};

/**
 * Hapus order
 */
const deleteOrder = async (id, deletedBy = null) => {
  const order = await Order.findById(id);
  if (!order) throw new Error("Order tidak ditemukan.");

  await logAction({
    action: "DELETE",
    entityType: "Order",
    entityId: order._id,
    changes: null,
    performedBy: deletedBy,
  });

  await order.deleteOne();
  return { message: "Order berhasil dihapus." };
};

/**
 * Summary keuangan per season
 * Total omset, total gaji worker, profit bersih
 */
const getSeasonSummary = async (seasonId) => {
  const result = await Order.aggregate([
    {
      $match: { seasonId: new (require("mongoose").Types.ObjectId)(seasonId) },
    },
    {
      $group: {
        _id: null,
        totalOmset: { $sum: "$price" },
        totalGajiWorker: { $sum: "$totalWorkerSalary" },
        profitBersih: { $sum: "$profit" },
        totalOrder: { $count: {} },
      },
    },
  ]);

  if (result.length === 0) {
    return {
      totalOmset: 0,
      totalGajiWorker: 0,
      profitBersih: 0,
      totalOrder: 0,
    };
  }

  const { totalOmset, totalGajiWorker, profitBersih, totalOrder } = result[0];
  return { totalOmset, totalGajiWorker, profitBersih, totalOrder };
};

/**
 * Rekap gaji per worker dalam satu season
 * Berisi: total salary earned, total paid, total unpaid
 * (totalEarned sudah termasuk jobSalary + adminFeeTotal, karena pakai w.salary)
 */
const getWorkerSalarySummary = async (seasonId) => {
  const orders = await Order.find({ seasonId });

  const workerMap = {};

  orders.forEach((order) => {
    order.workers.forEach((w) => {
      if (!workerMap[w.name]) {
        workerMap[w.name] = {
          name: w.name,
          totalEarned: 0,
          totalPaid: 0,
          totalUnpaid: 0,
          orderCount: 0,
        };
      }
      workerMap[w.name].totalEarned += w.salary;
      workerMap[w.name].orderCount += 1;
      if (w.isPaid) {
        workerMap[w.name].totalPaid += w.salary;
      } else {
        workerMap[w.name].totalUnpaid += w.salary;
      }
    });
  });

  return Object.values(workerMap).sort((a, b) => b.totalEarned - a.totalEarned);
};

const getDashboardSummary = async () => {
  const [orderStats, seasonCount, workerStats] = await Promise.all([
    Order.aggregate([
      {
        $group: {
          _id: null,
          totalOrder: { $count: {} },
          totalOmset: { $sum: "$price" },
          totalGaji: { $sum: "$totalWorkerSalary" },
          totalProfit: { $sum: "$profit" },
        },
      },
    ]),
    require("../models/season.model").countDocuments(),
    // ambil semua nama worker unik
    Order.aggregate([
      { $unwind: "$workers" },
      { $group: { _id: "$workers.name" } },
      { $count: "total" },
    ]),
  ]);

  const stats = orderStats[0] || {
    totalOrder: 0,
    totalOmset: 0,
    totalGaji: 0,
    totalProfit: 0,
  };

  return {
    totalSeason: seasonCount,
    totalOrder: stats.totalOrder,
    totalOmset: stats.totalOmset,
    totalGaji: stats.totalGaji,
    totalProfit: stats.totalProfit,
    totalWorker: workerStats[0]?.total || 0,
  };
};

/**
 * Rekap semua worker across ALL seasons atau per season
 * Berisi history order, total earned, unpaid, akun dikerjakan
 */
const getWorkerDetail = async (workerName, seasonId = null) => {
  const query = { "workers.name": workerName.toUpperCase() };
  if (seasonId)
    query.seasonId = new (require("mongoose").Types.ObjectId)(seasonId);

  const orders = await Order.find(query)
    .populate("seasonId", "name label")
    .sort({ date: -1 });

  let totalEarned = 0,
    totalPaid = 0,
    totalUnpaid = 0;

  const history = orders.map((order) => {
    const worker = order.workers.find(
      (w) => w.name === workerName.toUpperCase(),
    );
    totalEarned += worker.salary;
    if (worker.isPaid) totalPaid += worker.salary;
    else totalUnpaid += worker.salary;

    const rankBreakdown = Object.fromEntries(worker.rankBreakdown);
    const bonusBreakdown = worker.bonusBreakdown
      ? Object.fromEntries(worker.bonusBreakdown)
      : {};

    // rate worker per tier dari rateSnapshot saat order dibuat
    const snap = order.rateSnapshot;
    const rateList = Array.isArray(snap)
      ? snap
      : Object.values(snap || {}).filter(
          (v) => v && typeof v === "object" && v.tier,
        );
    const isGendong = (order.category || "").toUpperCase().includes("GENDONG");

    const allTiers = [
      ...new Set([
        ...Object.keys(rankBreakdown),
        ...Object.keys(bonusBreakdown),
      ]),
    ];

    const rankDetails = allTiers
      .map((tier) => {
        const stars = rankBreakdown[tier] || 0;
        const bonus = bonusBreakdown[tier] || 0;
        const rateEntry = rateList.find(
          (r) => String(r.tier).toUpperCase() === tier.toUpperCase(),
        );
        const ratePerStar = rateEntry
          ? isGendong
            ? rateEntry.rate_worker_jokgen
            : rateEntry.rate_worker_joki
          : null;
        return { tier, stars, bonus, ratePerStar };
      })
      .filter((r) => r.stars > 0 || r.bonus > 0);

    return {
      orderId: order._id,
      seasonId: order.seasonId?._id || null,
      seasonName: order.seasonId?.name || "—",
      customerName: order.customerName,
      date: order.date,
      category: order.category,
      rankBreakdown,
      bonusBreakdown,
      rankDetails,
      customSalary: worker.customSalary,
      adminIds: worker.adminIds || [],
      jobSalary: worker.jobSalary,
      adminFeeTotal: worker.adminFeeTotal,
      salary: worker.salary,
      isPaid: worker.isPaid,
      paidAt: worker.paidAt,
    };
  });

  return {
    name: workerName.toUpperCase(),
    totalEarned,
    totalPaid,
    totalUnpaid,
    totalOrders: orders.length,
    history,
  };
};

/**
 * List semua worker unik across semua season (atau filter per season)
 * dengan summary gaji
 */
const getAllWorkers = async (seasonId = null) => {
  const match = seasonId
    ? { seasonId: new (require("mongoose").Types.ObjectId)(seasonId) }
    : {};

  const result = await Order.aggregate([
    { $match: match },
    { $unwind: "$workers" },
    {
      $group: {
        _id: "$workers.name",
        totalEarned: { $sum: "$workers.salary" },
        totalPaid: {
          $sum: { $cond: ["$workers.isPaid", "$workers.salary", 0] },
        },
        totalUnpaid: {
          $sum: { $cond: ["$workers.isPaid", 0, "$workers.salary"] },
        },
        totalOrders: { $sum: 1 },
        unpaidOrders: { $sum: { $cond: ["$workers.isPaid", 0, 1] } },
      },
    },
    { $sort: { totalUnpaid: -1 } },
  ]);

  return result.map((w) => ({
    name: w._id,
    totalEarned: w.totalEarned,
    totalPaid: w.totalPaid,
    totalUnpaid: w.totalUnpaid,
    totalOrders: w.totalOrders,
    unpaidOrders: w.unpaidOrders,
  }));
};

const getTodayRange = () => {
  const wibNow = new Date(Date.now() + WIB_OFFSET_MS);
  const start = new Date(
    Date.UTC(
      wibNow.getUTCFullYear(),
      wibNow.getUTCMonth(),
      wibNow.getUTCDate(),
    ) - WIB_OFFSET_MS,
  );
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000 - 1);
  return { start, end };
};

/**
 * List semua "admin" (worker yang punya adminIds) beserta jumlah ID hari ini & total
 */
const getAllAdmins = async (seasonId = null) => {
  const { start, end } = getTodayRange();
  const match = seasonId
    ? { seasonId: new (require("mongoose").Types.ObjectId)(seasonId) }
    : {};

  const result = await Order.aggregate([
    { $match: match },
    { $unwind: "$workers" },
    { $match: { "workers.adminIds.0": { $exists: true } } },
    {
      $project: {
        name: "$workers.name",
        idCount: { $size: "$workers.adminIds" },
        adminFeeTotal: "$workers.adminFeeTotal",
        isAdminFeePaid: "$workers.isAdminFeePaid",
        createdAt: 1,
      },
    },
    {
      $group: {
        _id: "$name",
        totalIdInput: { $sum: "$idCount" },
        todayIdInput: {
          $sum: {
            $cond: [
              {
                $and: [
                  { $gte: ["$createdAt", start] },
                  { $lte: ["$createdAt", end] },
                ],
              },
              "$idCount",
              0,
            ],
          },
        },
        totalEarned: { $sum: "$adminFeeTotal" },
        totalPaid: {
          $sum: { $cond: ["$isAdminFeePaid", "$adminFeeTotal", 0] },
        },
        totalUnpaid: {
          $sum: { $cond: ["$isAdminFeePaid", 0, "$adminFeeTotal"] },
        },
      },
    },
    { $sort: { totalUnpaid: -1 } },
  ]);

  return result.map((a) => ({
    name: a._id,
    totalIdInput: a.totalIdInput,
    todayIdInput: a.todayIdInput,
    totalEarned: a.totalEarned,
    totalPaid: a.totalPaid,
    totalUnpaid: a.totalUnpaid,
  }));
};

/**
 * Detail history ID admin per worker (across order)
 */
const getAdminDetail = async (adminName, seasonId = null) => {
  const query = {
    "workers.name": adminName.toUpperCase(),
    "workers.adminIds.0": { $exists: true },
  };
  if (seasonId)
    query.seasonId = new (require("mongoose").Types.ObjectId)(seasonId);

  const orders = await Order.find(query)
    .populate("seasonId", "name label")
    .sort({ createdAt: -1 });

  let totalIdInput = 0,
    totalEarned = 0,
    totalPaid = 0,
    totalUnpaid = 0;

  const history = orders.map((order) => {
    const worker = order.workers.find(
      (w) => w.name === adminName.toUpperCase(),
    );
    const idCount = worker.adminIds.length;
    totalIdInput += idCount;
    totalEarned += worker.adminFeeTotal;
    if (worker.isAdminFeePaid) totalPaid += worker.adminFeeTotal;
    else totalUnpaid += worker.adminFeeTotal;

    return {
      orderId: order._id,

      seasonName: order.seasonId?.name || "—",
      customerName: order.customerName,
      inputAt: order.createdAt,
      adminIds: worker.adminIds,
      idCount,
      adminFeeTotal: worker.adminFeeTotal,
      isAdminFeePaid: worker.isAdminFeePaid,
      adminFeePaidAt: worker.adminFeePaidAt,
    };
  });

  return {
    name: adminName.toUpperCase(),
    totalIdInput,
    totalEarned,
    totalPaid,
    totalUnpaid,
    totalOrders: orders.length,
    history,
  };
};

/**
 * Tambah ID admin ke 1 worker di 1 order, tanpa rebuild worker.
 * Dipakai bot Telegram. ID yang sudah ada dilewati (tidak dobel).
 */
const addAdminIds = async (orderId, workerName, ids, meta = {}) => {
  const order = await Order.findById(orderId);
  if (!order) throw new Error("Order tidak ditemukan.");

  const name = workerName.toUpperCase();
  const worker = order.workers.find((w) => w.name === name);
  if (!worker)
    throw new Error(`Worker "${workerName}" tidak ditemukan di order ini.`);

  const season = await Season.findById(order.seasonId);
  const feePerId = season?.adminFee || 0;

  const existing = new Set(worker.adminIds.map(String));
  const fresh = [];
  const duplicates = [];
  ids
    .map((i) => String(i).trim())
    .filter(Boolean)
    .forEach((id) => {
      if (existing.has(id) || fresh.includes(id)) duplicates.push(id);
      else fresh.push(id);
    });

  if (fresh.length === 0) {
    return {
      order,
      added: 0,
      duplicates,
      total: worker.adminIds.length,
      feeTotal: worker.adminFeeTotal,
    };
  }

  worker.adminIds = [...worker.adminIds, ...fresh];
  worker.adminFeeTotal = worker.adminIds.length * feePerId;
  worker.salary = worker.jobSalary + worker.adminFeeTotal;
  // fee yang baru nambah belum dibayar
  worker.isAdminFeePaid = false;
  worker.adminFeePaidAt = null;

  order.totalWorkerSalary = order.workers.reduce((s, w) => s + w.salary, 0);
  order.profit = order.price - order.totalWorkerSalary;
  await order.save();

  await logAction({
    action: "UPDATE",
    entityType: "Order",
    entityId: order._id,
    changes: {
      adminIdsAdded: { workerName: name, ids: fresh, via: "telegram", ...meta },
    },
    performedBy: null,
  });

  return {
    order,
    added: fresh.length,
    duplicates,
    total: worker.adminIds.length,
    feeTotal: worker.adminFeeTotal,
  };
};

/**
 * Worker ambil job lewat balasan "take" di Telegram.
 * Atomik: hanya berhasil kalau workers masih kosong.
 */
const takeJob = async (orderId, messageId, workerName, telegramId, meta = {}) => {
  const base = { _id: orderId, "telegram.messageId": messageId };
  const order = await Order.findOne(base);
  if (!order) return { status: "expired" };

  const takenBy = (o) => (o?.workers || []).map((w) => w.name).join(", ");
  if (order.workers.length > 0)
    return { status: "taken", by: takenBy(order), order };

  const name = workerName.toUpperCase();
  const season = await Season.findById(order.seasonId).select("extraColumns");

  const pj = order.pendingJob || {};
  const jobSalary = pj.salary || 0;

  const update = {
    $push: {
      workers: {
        name,
        rankBreakdown: toPlain(pj.rankBreakdown),
        bonusBreakdown: toPlain(pj.bonusBreakdown),
        customSalary: pj.customSalary ?? null,
        adminIds: [],
        jobSalary,
        adminFeeTotal: 0,
        salary: jobSalary,
        isPaid: false,
        isAdminFeePaid: false,
      },
    },
    $set: {
      "telegram.takenBy": telegramId,
      pendingJob: {
        rankBreakdown: {},
        bonusBreakdown: {},
        customSalary: null,
        salary: 0,
      },
    },
  };
  if (order.status === "PENDING") update.$set.status = "PROCESS";
  if (season?.extraColumns?.some((c) => c.key === "worker"))
    update.$set["extraFields.worker"] = name;

  const updated = await Order.findOneAndUpdate(
    { ...base, workers: { $size: 0 } },
    update,
    { new: true },
  );
  if (!updated) {
    const cur = await Order.findOne(base);
    return { status: "taken", by: takenBy(cur), order: cur };
  }

  await logAction({
    action: "UPDATE",
    entityType: "Order",
    entityId: updated._id,
    changes: { jobTaken: { workerName: name, via: "telegram", ...meta } },
    performedBy: null,
  });

  return { status: "ok", order: updated };
};

/**
 * Worker batalkan job yang dia ambil (tombol DROP).
 * Hanya pengambil yang bisa drop, dan hanya kalau belum ada ID admin / belum dibayar.
 */
const dropJob = async (orderId, messageId, telegramId, meta = {}) => {
  const order = await Order.findOne({
    _id: orderId,
    "telegram.messageId": messageId,
  });
  if (!order) return { status: "expired" };
  if (order.workers.length === 0) return { status: "free", order };
  if (order.telegram?.takenBy !== telegramId) return { status: "not_owner" };

  const w = order.workers[0];
  if (w.isPaid || w.isAdminFeePaid || (w.adminIds || []).length > 0)
    return { status: "locked" };

  const update = {
    $set: {
      workers: [],
      "telegram.takenBy": null,
      pendingJob: {
        rankBreakdown: toPlain(w.rankBreakdown),
        bonusBreakdown: toPlain(w.bonusBreakdown),
        customSalary: w.customSalary ?? null,
        salary: w.jobSalary || 0,
      },
    },
  };
  if (order.status === "PROCESS") update.$set.status = "PENDING";
  if (order.extraFields?.get?.("worker") === w.name)
    update.$unset = { "extraFields.worker": "" };

  const updated = await Order.findOneAndUpdate(
    {
      _id: orderId,
      "telegram.messageId": messageId,
      "telegram.takenBy": telegramId,
      workers: { $size: 1 },
    },
    update,
    { new: true },
  );
  if (!updated) return { status: "not_owner" };

  await logAction({
    action: "UPDATE",
    entityType: "Order",
    entityId: updated._id,
    changes: { jobDropped: { workerName: w.name, via: "telegram", ...meta } },
    performedBy: null,
  });

  return { status: "ok", order: updated };
};

module.exports = {
  getOrdersBySeason,
  getOrderById,
  createOrder,
  updateOrder,
  markWorkerPaid,
  markAdminFeePaid,
  deleteOrder,
  getSeasonSummary,
  getWorkerSalarySummary,
  getWorkerDetail,
  getAllWorkers,
  getDashboardSummary,
  getAllAdmins,
  getAdminDetail,
  addAdminIds,
  takeJob,
  dropJob,
};
