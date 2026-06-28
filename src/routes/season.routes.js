const express = require("express");
const {
  getAll,
  getOne,
  create,
  update,
  remove,
  addColumn,
  removeColumn,
  updateRates,
} = require("../controllers/season.controller");
const { protect } = require("../middlewares/auth.middleware");

const router = express.Router();

// semua route season butuh login
router.use(protect);

// ── Season CRUD ───────────────────────────────────────────
router.get("/", getAll);
router.get("/:id", getOne);
router.post("/", create);
router.patch("/:id", update);
router.delete("/:id", remove);

// ── Kolom Dinamis ─────────────────────────────────────────
router.post("/:id/columns", addColumn);
router.delete("/:id/columns/:key", removeColumn);

// ── Rate Config ───────────────────────────────────────────
router.put("/:id/rates", updateRates);

module.exports = router;