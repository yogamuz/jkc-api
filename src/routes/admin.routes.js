const express = require("express");
const { getAllAdmins, getAdminDetail } = require("../controllers/order.controller");
const { protect } = require("../middlewares/auth.middleware");

const router = express.Router();
router.use(protect);

router.get("/", getAllAdmins);
router.get("/:name", getAdminDetail);

module.exports = router;