const orderService = require("../services/order.service");
const {
  validateCreateOrder,
  validateUpdateOrder,
} = require("../validation/order.validation");

// GET /api/orders?seasonId=xxx&workerName=xxx&status=xxx&dateFrom=xxx&dateTo=xxx
const getAll = async (req, res, next) => {
  try {
    const { seasonId, workerName, status, dateFrom, dateTo } = req.query;
    if (!seasonId)
      return res
        .status(400)
        .json({ message: "seasonId wajib diisi di query." });

    const orders = await orderService.getOrdersBySeason(seasonId, {
      workerName,
      status,
      dateFrom,
      dateTo,
    });

    res.json({ data: orders });
  } catch (err) {
    next(err);
  }
};

// GET /api/orders/:id
const getOne = async (req, res, next) => {
  try {
    const order = await orderService.getOrderById(req.params.id);
    res.json({ data: order });
  } catch (err) {
    next(err);
  }
};

// POST /api/orders
const create = async (req, res, next) => {
  try {
    const errors = validateCreateOrder(req.body);
    if (errors.length)
      return res.status(400).json({ message: errors.join(" ") });

    const order = await orderService.createOrder({
      ...req.body,
      createdBy: req.user.id,
      updatedBy: req.user.id,
    });
    res.status(201).json({ message: "Order berhasil dibuat.", data: order });
  } catch (err) {
    next(err);
  }
};

// PATCH /api/orders/:id
const update = async (req, res, next) => {
  try {
    const errors = validateUpdateOrder(req.body);
    if (errors.length)
      return res.status(400).json({ message: errors.join(" ") });

    const order = await orderService.updateOrder(req.params.id, {
      ...req.body,
      updatedBy: req.user.id,
    });
    res.json({ message: "Order berhasil diupdate.", data: order });
  } catch (err) {
    next(err);
  }
};

// DELETE /api/orders/:id
const remove = async (req, res, next) => {
  try {
    const result = await orderService.deleteOrder(req.params.id);
    res.json(result);
  } catch (err) {
    next(err);
  }
};

// PATCH /api/orders/:id/workers/:workerName/paid
const markPaid = async (req, res, next) => {
  try {
    const { isPaid } = req.body;
    if (typeof isPaid !== "boolean")
      return res
        .status(400)
        .json({ message: "isPaid harus boolean (true/false)." });

    const order = await orderService.markWorkerPaid(
      req.params.id,
      req.params.workerName,
      isPaid,
      req.user.id,
    );
    res.json({
      message: `Gaji worker berhasil di-mark sebagai ${isPaid ? "PAID" : "UNPAID"}.`,
      data: order,
    });
  } catch (err) {
    next(err);
  }
};

// GET /api/orders/summary?seasonId=xxx
const summary = async (req, res, next) => {
  try {
    if (req.user.role !== "owner")
      return res.status(403).json({
        message:
          "Akses ditolak. Hanya owner yang bisa melihat ringkasan keuangan.",
      });

    const { seasonId } = req.query;
    if (!seasonId)
      return res
        .status(400)
        .json({ message: "seasonId wajib diisi di query." });

    const data = await orderService.getSeasonSummary(seasonId);
    res.json({ data });
  } catch (err) {
    next(err);
  }
};

// GET /api/orders/workers/summary?seasonId=xxx
const workerSummary = async (req, res, next) => {
  try {
    const { seasonId } = req.query;
    if (!seasonId)
      return res
        .status(400)
        .json({ message: "seasonId wajib diisi di query." });

    const data = await orderService.getWorkerSalarySummary(seasonId);
    res.json({ data });
  } catch (err) {
    next(err);
  }
};
// GET /api/dashboard/summary
const dashboardSummary = async (req, res, next) => {
  try {
    const data = await orderService.getDashboardSummary();

    if (req.user.role !== "owner") {
      const { totalOmset, totalGaji, totalProfit, ...rest } = data;
      return res.json({ data: rest });
    }

    res.json({ data });
  } catch (err) {
    next(err);
  }
};
// GET /api/workers?seasonId=xxx (opsional)
const getAllWorkers = async (req, res, next) => {
  try {
    const { seasonId } = req.query;
    const data = await orderService.getAllWorkers(seasonId || null);
    res.json({ data });
  } catch (err) {
    next(err);
  }
};

// GET /api/workers/:name?seasonId=xxx (opsional)
const getWorkerDetail = async (req, res, next) => {
  try {
    const { seasonId } = req.query;
    const data = await orderService.getWorkerDetail(
      req.params.name,
      seasonId || null,
    );
    res.json({ data });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  getAll,
  getOne,
  create,
  update,
  remove,
  markPaid,
  summary,
  workerSummary,
  getWorkerDetail,
  getAllWorkers,
  dashboardSummary,
};
