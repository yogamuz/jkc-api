const AuditLog = require("../models/auditlog.model");

const diffFields = (before = {}, after = {}, fields = []) => {
  const changes = {};
  fields.forEach((key) => {
    if (JSON.stringify(before[key]) !== JSON.stringify(after[key])) {
      changes[key] = { from: before[key], to: after[key] };
    }
  });
  return Object.keys(changes).length ? changes : null;
};

const logAction = async ({ action, entityType, entityId, changes, performedBy }) => {
  try {
    await AuditLog.create({ action, entityType, entityId, changes, performedBy });
  } catch (err) {
    console.error("Gagal mencatat audit log:", err.message);
  }
};

const getLogs = async (filters = {}) => {
  const query = {};
  if (filters.entityType) query.entityType = filters.entityType;
  if (filters.entityId) query.entityId = filters.entityId;
  if (filters.performedBy) query.performedBy = filters.performedBy;
  if (filters.dateFrom || filters.dateTo) {
    query.createdAt = {};
    if (filters.dateFrom) query.createdAt.$gte = new Date(filters.dateFrom);
    if (filters.dateTo) query.createdAt.$lte = new Date(filters.dateTo);
  }
  return AuditLog.find(query)
    .populate("performedBy", "avatar username")
    .sort({ createdAt: -1 });
};

module.exports = { diffFields, logAction, getLogs };