// src/bot/polling.js
// Mode LOKAL: bot jalan sebagai proses terpisah dan nanya ke Telegram terus-menerus.
// Jalankan: npm run bot
require("dotenv").config();
const connectDB = require("../config/db");
const { createBot } = require("./index");

(async () => {
  await connectDB();
  const bot = createBot();

  // hapus menu command lama (/id, /gaji, /unpaid, /help) dari Telegram
  await bot.api.deleteMyCommands();

  bot.start({
    onStart: (me) => console.log(`Bot @${me.username} jalan (polling)`),
  });
})().catch((err) => {
  console.error("Bot gagal start:", err.message);
  process.exit(1);
});