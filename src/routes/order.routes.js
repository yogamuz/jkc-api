const express = require("express");
const {
  getAll,
  getOne,
  create,
  update,
  remove,
  markPaid,
  summary,
  workerSummary,
} = require("../controllers/order.controller");
const { protect } = require("../middlewares/auth.middleware");

const router = express.Router();

router.use(protect);

// ── Summary (harus sebelum /:id supaya tidak konflik) ─────
router.get("/summary", summary);
router.get("/workers/summary", workerSummary);

// ── Order CRUD ────────────────────────────────────────────
router.get("/", getAll);
router.get("/:id", getOne);
router.post("/", create);
router.patch("/:id", update);
router.delete("/:id", remove);

// ── Worker Paid Status ────────────────────────────────────
router.patch("/:id/workers/:workerName/paid", markPaid);

module.exports = router;