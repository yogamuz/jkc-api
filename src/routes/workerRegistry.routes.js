const express = require("express");
const {
  getAll,
  create,
  importFromOrders,
  invite,
  reset,
  update,
  remove,
} = require("../controllers/workerRegistry.controller");
const { protect, requireRole } = require("../middlewares/auth.middleware");

const router = express.Router();

// Semua route di sini khusus owner
router.use(protect, requireRole("owner"));

router.get("/", getAll);
router.post("/", create);
router.post("/import-from-orders", importFromOrders);
router.post("/:id/invite", invite);
router.post("/:id/reset", reset);
router.patch("/:id", update);
router.delete("/:id", remove);

module.exports = router;    