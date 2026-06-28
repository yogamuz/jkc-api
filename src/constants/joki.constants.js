// Tipe data yang bisa dipakai untuk kolom dinamis
const COLUMN_TYPES = ["text", "number", "select", "date", "boolean"];

// Kolom default yang selalu ada di setiap season (tidak bisa dihapus)
const DEFAULT_COLUMNS = [
  { key: "name", label: "Nama Customer", type: "text", required: true },
  { key: "date", label: "Tanggal", type: "date", required: true },
  { key: "category", label: "Kategori", type: "select", required: true },
  { key: "type", label: "Tipe", type: "select", required: true },
  { key: "payment", label: "Pembayaran", type: "select", required: true },
  { key: "price", label: "Harga", type: "number", required: true },
  { key: "workerSalary", label: "Gaji Worker", type: "number", required: false },
  { key: "profit", label: "Profit", type: "number", required: false },
];

// Kategori order default
const ORDER_CATEGORIES = ["JOKI RANK", "JOKI GENDONG", "JOKI RISING", "JOKI MONTAGE"];

// Tipe order
const ORDER_TYPES = ["NEW", "RO"];

// Metode pembayaran
const PAYMENT_METHODS = ["QRIS", "BCA", "DANA", "SPAY", "SEABANK", "OVO", "GOPAY"];

// Status order
const ORDER_STATUS = ["PENDING", "DONE", "PROCESS"];

module.exports = {
  COLUMN_TYPES,
  DEFAULT_COLUMNS,
  ORDER_CATEGORIES,
  ORDER_TYPES,
  PAYMENT_METHODS,
  ORDER_STATUS,
};