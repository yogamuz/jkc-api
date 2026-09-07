const Order = require("../models/order.model");
const Season = require("../models/season.model");
const { getRateByDate, calculateWorkerSalary } = require("./season.service");
const { logAction, diffFields } = require("./auditLog.service");

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
    customSalary: hasCustomSalary ? Number(w.customSalary) : null,
    adminIds,
    jobSalary,
    adminFeeTotal,
    salary: jobSalary + adminFeeTotal,
    isPaid: w.isPaid || false,
    paidAt: w.paidAt || null,
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
    if (filters.dateFrom) query.date.$gte = new Date(filters.dateFrom);
    if (filters.dateTo) query.date.$lte = new Date(filters.dateTo);
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
  const totalWorkerSalary =
    calculatedSalary > 0 ? calculatedSalary : data.totalWorkerSalary || 0;

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
    workers: processedWorkers,
    totalWorkerSalary,
    profit,
    extraFields,
    rateSnapshot: rates ? { ...rates, adminFeePerId } : { adminFeePerId },
    createdBy: data.createdBy || null,
    updatedBy: data.createdBy || null,
  });

  return order;

  await logAction({
    action: "CREATE",
    entityType: "Order",
    entityId: order._id,
    changes: null,
    performedBy: data.createdBy || null,
  });
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
      order.workers = data.workers.map((w) =>
        buildWorker(w, rates, category, adminFeePerId),
      );
    }

    order.totalWorkerSalary = order.workers.reduce(
      (sum, w) => sum + w.salary,
      0,
    );
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

    return {
      orderId: order._id,
      seasonId: order.seasonId?._id || null,
      seasonName: order.seasonId?.name || "—",
      customerName: order.customerName,
      date: order.date,
      category: order.category,
      rankBreakdown: Object.fromEntries(worker.rankBreakdown),
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
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date();
  end.setHours(23, 59, 59, 999);
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
};
