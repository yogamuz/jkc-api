const express = require("express");
const { getAll } = require("../controllers/auditLog.controller");
const { protect } = require("../middlewares/auth.middleware");

const router = express.Router();
router.use(protect);

router.get("/", getAll);

module.exports = router;