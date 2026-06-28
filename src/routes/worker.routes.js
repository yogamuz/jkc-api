const express = require("express");
const { getAllWorkers, getWorkerDetail } = require("../controllers/order.controller");
const { protect } = require("../middlewares/auth.middleware");

const router = express.Router();
router.use(protect);

router.get("/", getAllWorkers);
router.get("/:name", getWorkerDetail);

module.exports = router;