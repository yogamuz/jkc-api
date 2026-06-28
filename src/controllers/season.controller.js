const seasonService = require("../services/season.service");
const { validateCreateSeason, validateAddColumn } = require("../validation/season.validation");

// GET /api/seasons
const getAll = async (req, res, next) => {
  try {
    const seasons = await seasonService.getAllSeasons();
    res.json({ data: seasons });
  } catch (err) {
    next(err);
  }
};

// GET /api/seasons/:id
const getOne = async (req, res, next) => {
  try {
    const season = await seasonService.getSeasonById(req.params.id);
    res.json({ data: season });
  } catch (err) {
    next(err);
  }
};

// POST /api/seasons
const create = async (req, res, next) => {
  try {
    const errors = validateCreateSeason(req.body);
    if (errors.length) return res.status(400).json({ message: errors.join(" ") });

    const season = await seasonService.createSeason(req.body);
    res.status(201).json({ message: "Season berhasil dibuat.", data: season });
  } catch (err) {
    next(err);
  }
};

// PATCH /api/seasons/:id
const update = async (req, res, next) => {
  try {
    const season = await seasonService.updateSeason(req.params.id, req.body);
    res.json({ message: "Season berhasil diupdate.", data: season });
  } catch (err) {
    next(err);
  }
};

// DELETE /api/seasons/:id
const remove = async (req, res, next) => {
  try {
    const result = await seasonService.deleteSeason(req.params.id);
    res.json(result);
  } catch (err) {
    next(err);
  }
};

// POST /api/seasons/:id/columns
const addColumn = async (req, res, next) => {
  try {
    const errors = validateAddColumn(req.body);
    if (errors.length) return res.status(400).json({ message: errors.join(" ") });

    const season = await seasonService.addColumn(req.params.id, req.body);
    res.status(201).json({ message: "Kolom berhasil ditambahkan.", data: season });
  } catch (err) {
    next(err);
  }
};

// DELETE /api/seasons/:id/columns/:key
const removeColumn = async (req, res, next) => {
  try {
    const season = await seasonService.removeColumn(req.params.id, req.params.key);
    res.json({ message: "Kolom berhasil dihapus.", data: season });
  } catch (err) {
    next(err);
  }
};

// PUT /api/seasons/:id/rates
const updateRates = async (req, res, next) => {
  try {
    const { rates, note } = req.body;
    const season = await seasonService.updateRates(req.params.id, rates, note);
    res.json({ message: "Rate berhasil diupdate. History rate lama tetap tersimpan.", data: season });
  } catch (err) {
    next(err);
  }
};

module.exports = { getAll, getOne, create, update, remove, addColumn, removeColumn, updateRates };