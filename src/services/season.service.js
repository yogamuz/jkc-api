const Season = require("../models/season.model");

const getAllSeasons = async () => {
  return Season.find().sort({ createdAt: -1 }).select("-__v");
};

const getSeasonById = async (id) => {
  const season = await Season.findById(id).select("-__v");
  if (!season) throw new Error("Season tidak ditemukan.");
  return season;
};

const createSeason = async (data) => {
  const { name, label, rates, extraColumns, adminFee, startDate, endDate } = data;

  const exists = await Season.findOne({ name: name.trim().toUpperCase() });
  if (exists) throw new Error(`Season "${name.toUpperCase()}" sudah ada.`);

  // Kalau pas buat season langsung ada rates, langsung masuk rateHistory dengan effectiveDate hari ini
  const rateHistory =
    rates && rates.length > 0
      ? [{ effectiveDate: new Date(), rates, note: "Rate awal season" }]
      : [];

  const season = await Season.create({
    name: name.trim().toUpperCase(),
    label: label || `Season ${name.trim().toUpperCase()}`,
    rateHistory,
    extraColumns: extraColumns || [],
    adminFee: adminFee || 0,
    startDate: startDate || null,
    endDate: endDate || null,
  });

  return season;
};

const updateSeason = async (id, data) => {
  const season = await Season.findById(id);
  if (!season) throw new Error("Season tidak ditemukan.");

  const allowed = ["label", "isActive", "adminFee", "startDate", "endDate"];
  allowed.forEach((key) => {
    if (data[key] !== undefined) season[key] = data[key];
  });

  await season.save();
  return season;
};

/**
 * Update rate — PUSH entry baru ke rateHistory, tidak replace
 * Rate lama tetap tersimpan untuk referensi order sebelumnya
 */
const updateRates = async (id, rates, note = "") => {
  const season = await Season.findById(id);
  if (!season) throw new Error("Season tidak ditemukan.");
  if (!Array.isArray(rates)) throw new Error("Rates harus berupa array.");

  season.rateHistory.push({
    effectiveDate: new Date(),
    rates,
    note,
  });

  await season.save();
  return season;
};

/**
 * Ambil rate yang berlaku pada tanggal tertentu
 * Cari rateHistory entry dengan effectiveDate <= targetDate, ambil yang paling dekat
 */
const getRateByDate = (season, targetDate) => {
  const target = new Date(targetDate);
  // set ke akhir hari supaya order hari yang sama dengan rate tetap ketemu
  target.setHours(23, 59, 59, 999);

  const validEntries = season.rateHistory
    .filter((entry) => new Date(entry.effectiveDate) <= target)
    .sort((a, b) => new Date(b.effectiveDate) - new Date(a.effectiveDate));

  if (validEntries.length === 0) return null;
  return validEntries[0].rates;
};

/**
 * Ambil rate aktif saat ini (entry terbaru)
 */
const getActiveRates = (season) => {
  if (!season.rateHistory || season.rateHistory.length === 0) return [];

  const sorted = [...season.rateHistory].sort(
    (a, b) => new Date(b.effectiveDate) - new Date(a.effectiveDate)
  );
  return sorted[0].rates;
};

/**
 * Hitung gaji worker berdasarkan rankBreakdown dan rate pada tanggal order
 * rankBreakdown contoh: { LEGEND: 5, MAWI: 3 }
 * category: "JOKI RANK" atau "JOKI GENDONG"
 */
const calculateWorkerSalary = (rates, rankBreakdown, category) => {
  if (!rates || rates.length === 0) return 0;

  const isGendong = category?.toUpperCase().includes("GENDONG");
  let total = 0;

  for (const [tier, stars] of Object.entries(rankBreakdown)) {
    if (!stars || stars <= 0) continue;

    const rateEntry = rates.find((r) => r.tier.toUpperCase() === tier.toUpperCase());
    if (!rateEntry) continue;

    const ratePerStar = isGendong ? rateEntry.rate_worker_jokgen : rateEntry.rate_worker_joki;
    total += ratePerStar * stars;
  }

  return total;
};

const addColumn = async (id, columnData) => {
  const season = await Season.findById(id);
  if (!season) throw new Error("Season tidak ditemukan.");

  const isDuplicate = season.extraColumns.some((col) => col.key === columnData.key);
  if (isDuplicate) throw new Error(`Kolom dengan key "${columnData.key}" sudah ada.`);

  columnData.order = season.extraColumns.length;
  season.extraColumns.push(columnData);
  await season.save();
  return season;
};

const removeColumn = async (id, columnKey) => {
  const season = await Season.findById(id);
  if (!season) throw new Error("Season tidak ditemukan.");

  const index = season.extraColumns.findIndex((col) => col.key === columnKey);
  if (index === -1) throw new Error(`Kolom "${columnKey}" tidak ditemukan.`);

  season.extraColumns.splice(index, 1);
  await season.save();
  return season;
};

const deleteSeason = async (id) => {
  const season = await Season.findById(id);
  if (!season) throw new Error("Season tidak ditemukan.");

  await season.deleteOne();
  return { message: `Season "${season.name}" berhasil dihapus.` };
};

module.exports = {
  getAllSeasons,
  getSeasonById,
  createSeason,
  updateSeason,
  updateRates,
  getRateByDate,
  getActiveRates,
  calculateWorkerSalary,
  addColumn,
  removeColumn,
  deleteSeason,
};