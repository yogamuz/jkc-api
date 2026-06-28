const { COLUMN_TYPES } = require("../constants/joki.constants");

/**
 * Validasi body untuk create season
 */
const validateCreateSeason = (body) => {
  const errors = [];
  const { name, rates, extraColumns } = body;

  if (!name || typeof name !== "string" || name.trim().length === 0) {
    errors.push("Nama season wajib diisi.");
  }

  // rates di sini adalah array rate awal (opsional saat create)
  if (rates && !Array.isArray(rates)) {
    errors.push("Rates harus berupa array.");
  }

  if (rates && Array.isArray(rates)) {
    rates.forEach((r, i) => {
      if (!r.tier) errors.push(`Rate index ${i}: tier wajib diisi.`);
      if (r.rate_store_joki !== undefined && typeof r.rate_store_joki !== "number") errors.push(`Rate index ${i}: rate_store_joki harus angka.`);
      if (r.rate_store_jokgen !== undefined && typeof r.rate_store_jokgen !== "number") errors.push(`Rate index ${i}: rate_store_jokgen harus angka.`);
      if (r.rate_worker_joki !== undefined && typeof r.rate_worker_joki !== "number") errors.push(`Rate index ${i}: rate_worker_joki harus angka.`);
      if (r.rate_worker_jokgen !== undefined && typeof r.rate_worker_jokgen !== "number") errors.push(`Rate index ${i}: rate_worker_jokgen harus angka.`);
    });
  }

  if (extraColumns && !Array.isArray(extraColumns)) {
    errors.push("extraColumns harus berupa array.");
  }

  if (extraColumns && Array.isArray(extraColumns)) {
    extraColumns.forEach((col, i) => {
      if (!col.key) errors.push(`Column index ${i}: key wajib diisi.`);
      if (!col.label) errors.push(`Column index ${i}: label wajib diisi.`);
      if (col.type && !COLUMN_TYPES.includes(col.type)) {
        errors.push(`Column index ${i}: type tidak valid. Pilihan: ${COLUMN_TYPES.join(", ")}`);
      }
    });
  }

  return errors;
};

/**
 * Validasi body untuk tambah kolom dinamis
 */
const validateAddColumn = (body) => {
  const errors = [];
  const { key, label, type } = body;

  if (!key || typeof key !== "string") errors.push("Key wajib diisi.");
  if (key && !/^[a-zA-Z0-9_]+$/.test(key)) errors.push("Key hanya boleh huruf, angka, dan underscore.");
  if (!label || typeof label !== "string") errors.push("Label wajib diisi.");
  if (type && !COLUMN_TYPES.includes(type)) errors.push(`Type tidak valid. Pilihan: ${COLUMN_TYPES.join(", ")}`);

  return errors;
};

module.exports = { validateCreateSeason, validateAddColumn };