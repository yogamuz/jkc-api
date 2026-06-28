const { ORDER_STATUS } = require("../constants/joki.constants");

/**
 * Validasi body untuk create order
 */
const validateCreateOrder = (body) => {
  const errors = [];
  const { seasonId, customerName, date, category, price, workers } = body;

  if (!seasonId) errors.push("seasonId wajib diisi.");
  if (!customerName || typeof customerName !== "string" || customerName.trim().length === 0)
    errors.push("Nama customer wajib diisi.");
  if (!category || typeof category !== "string" || category.trim().length === 0)
    errors.push("Kategori wajib diisi.");
  if (price === undefined || price === null) errors.push("Harga wajib diisi.");
  if (typeof price !== "number" || price < 0) errors.push("Harga harus angka dan tidak boleh negatif.");
  if (date && isNaN(new Date(date).getTime())) errors.push("Format tanggal tidak valid.");

  if (workers !== undefined) {
    if (!Array.isArray(workers)) {
      errors.push("Workers harus berupa array.");
    } else {
      workers.forEach((w, i) => {
        if (!w.name || typeof w.name !== "string")
          errors.push(`Worker index ${i}: name wajib diisi.`);
        if (w.rankBreakdown !== undefined && typeof w.rankBreakdown !== "object")
          errors.push(`Worker index ${i}: rankBreakdown harus berupa object.`);
        if (w.rankBreakdown) {
          Object.entries(w.rankBreakdown).forEach(([tier, stars]) => {
            if (typeof stars !== "number" || stars < 0)
              errors.push(`Worker index ${i}: stars untuk tier ${tier} harus angka positif.`);
          });
        }
      });
    }
  }

  return errors;
};

/**
 * Validasi body untuk update order
 */
const validateUpdateOrder = (body) => {
  const errors = [];
  const { price, status, workers } = body;

  if (price !== undefined) {
    if (typeof price !== "number" || price < 0) errors.push("Harga harus angka dan tidak boleh negatif.");
  }

  if (status !== undefined && !ORDER_STATUS.includes(status))
    errors.push(`Status tidak valid. Pilihan: ${ORDER_STATUS.join(", ")}`);

  if (workers !== undefined) {
    if (!Array.isArray(workers)) {
      errors.push("Workers harus berupa array.");
    } else {
      workers.forEach((w, i) => {
        if (!w.name || typeof w.name !== "string")
          errors.push(`Worker index ${i}: name wajib diisi.`);
        if (w.rankBreakdown) {
          Object.entries(w.rankBreakdown).forEach(([tier, stars]) => {
            if (typeof stars !== "number" || stars < 0)
              errors.push(`Worker index ${i}: stars untuk tier ${tier} harus angka positif.`);
          });
        }
      });
    }
  }

  return errors;
};

module.exports = { validateCreateOrder, validateUpdateOrder };