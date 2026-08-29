const auditLogService = require("../services/auditLog.service");

// GET /api/audit-logs?entityType=xxx&entityId=xxx&performedBy=xxx&dateFrom=xxx&dateTo=xxx
const getAll = async (req, res, next) => {
  try {
    if (req.user.role !== "owner")
      return res.status(403).json({
        message: "Akses ditolak. Hanya owner yang bisa melihat history log.",
      });

    const { entityType, entityId, performedBy, dateFrom, dateTo } = req.query;
    const data = await auditLogService.getLogs({
      entityType, entityId, performedBy, dateFrom, dateTo,
    });
    res.json({ data });
  } catch (err) {
    next(err);
  }
};

module.exports = { getAll };