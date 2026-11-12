const mongoose = require("mongoose");
const registry = require("../services/workerRegistry.service");

const checkId = (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    res.status(400).json({ message: "ID worker tidak valid." });
    return false;
  }
  return true;
};

// GET /api/worker-registry
const getAll = async (req, res, next) => {
  try {
    res.json({ data: await registry.listWorkers() });
  } catch (err) {
    next(err);
  }
};

// POST /api/worker-registry  { name }
const create = async (req, res, next) => {
  try {
    const worker = await registry.createWorker(req.body?.name, req.user.id);
    res.status(201).json({ message: "Worker berhasil ditambahkan.", data: worker });
  } catch (err) {
    next(err);
  }
};

// POST /api/worker-registry/import-from-orders
const importFromOrders = async (req, res, next) => {
  try {
    const data = await registry.importFromOrders();
    res.json({
      message: `${data.added.length} worker ditambahkan dari data order.`,
      data,
    });
  } catch (err) {
    next(err);
  }
};

// POST /api/worker-registry/:id/invite  -> kode hanya tampil sekali di response ini
const invite = async (req, res, next) => {
  try {
    if (!checkId(req, res)) return;
    const data = await registry.generateInvite(req.params.id, req.user.id);
    res.set("Cache-Control", "no-store");
    res.json({ message: "Kode berhasil dibuat.", data });
  } catch (err) {
    next(err);
  }
};

// POST /api/worker-registry/:id/reset
const reset = async (req, res, next) => {
  try {
    if (!checkId(req, res)) return;
    const worker = await registry.resetWorker(req.params.id, req.user.id);
    res.json({ message: "Verifikasi worker di-reset.", data: worker });
  } catch (err) {
    next(err);
  }
};

// PATCH /api/worker-registry/:id  { isActive }
const update = async (req, res, next) => {
  try {
    if (!checkId(req, res)) return;
    if (typeof req.body?.isActive !== "boolean")
      return res.status(400).json({ message: "isActive harus boolean." });
    const worker = await registry.setActive(
      req.params.id,
      req.body.isActive,
      req.user.id,
    );
    res.json({ message: "Worker berhasil diupdate.", data: worker });
  } catch (err) {
    next(err);
  }
};

// DELETE /api/worker-registry/:id
const remove = async (req, res, next) => {
  try {
    if (!checkId(req, res)) return;
    res.json(await registry.deleteWorker(req.params.id, req.user.id));
  } catch (err) {
    next(err);
  }
};

module.exports = { getAll, create, importFromOrders, invite, reset, update, remove };