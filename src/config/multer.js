const multer = require("multer");

// Simpan di memory, bukan disk
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 }, // max 2MB
  fileFilter: (req, file, cb) => {
    const allowed = ["image/jpeg", "image/png", "image/webp", "image/jpg"];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error("Format file tidak didukung. Gunakan JPG, PNG, atau WEBP."));
  },
});

module.exports = upload;