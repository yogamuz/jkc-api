const { dashboardSummary } = require("./controllers/order.controller");
const { protect } = require("./middlewares/auth.middleware");

const express = require("express");
const cookieParser = require("cookie-parser");
const helmet = require("helmet");
const cors = require("cors");
require("dotenv").config();

const connectDB = require("./config/db");
const authRoutes = require("./routes/auth.routes");
const seasonRoutes = require("./routes/season.routes");
const orderRoutes = require("./routes/order.routes");
const workerRoutes = require("./routes/worker.routes");
const { errorHandler } = require("./middlewares/error.middleware");

const app = express();

// ── Connect Database ──────────────────────────────────────
connectDB();

// ── Global Middleware ─────────────────────────────────────
app.use(helmet());

const allowedOrigins = [
  process.env.CLIENT_URL,
  process.env.CLIENT_URL_DEV,
];

app.use(
  cors({
    origin: function (origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"));
      }
    },
    credentials: true,
  })
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// ── Routes ────────────────────────────────────────────────
app.use("/api/auth", authRoutes);
app.use("/api/seasons", seasonRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/dashboard/summary", protect, dashboardSummary);
app.use("/api/workers", workerRoutes);
// Health check
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// ── Error Handler (harus paling bawah) ───────────────────
app.use(errorHandler);

// ── Start Server ──────────────────────────────────────────
if (process.env.NODE_ENV !== "production") {
  const PORT = process.env.PORT || 5000;
  app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT} [${process.env.NODE_ENV}]`);
  });
}

module.exports = app;
