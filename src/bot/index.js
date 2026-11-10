// src/bot/index.js
const { Bot } = require("grammy");
const mongoose = require("mongoose");
const orderService = require("../services/order.service");
const { takeKeyboard, dropKeyboard, esc } = require("../services/telegram.service");

// "111:ACIL,222:JULIO" -> { 111: "ACIL", 222: "JULIO" }
const parseWorkerMap = (v) =>
  Object.fromEntries(
    (v || "")
      .split(",")
      .map((s) => s.split(":").map((x) => x.trim()))
      .filter(([id, name]) => id && name)
      .map(([id, name]) => [Number(id), name.toUpperCase()]),
  );

const createBot = () => {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN belum diset di .env");

  const groupId = process.env.TELEGRAM_GROUP_ID
    ? Number(process.env.TELEGRAM_GROUP_ID)
    : null;
  const workerMap = parseWorkerMap(process.env.TELEGRAM_WORKER_NAMES);

  const bot = new Bot(token);

  // Nama worker: mapping env dulu, kalau tidak ada pakai nama akun Telegram
  const resolveWorkerName = (from) =>
    workerMap[from.id] ||
    (from.first_name || from.username || "").trim().toUpperCase();

  const editMsg = (ctx, text, keyboard) =>
    ctx
      .editMessageText(text, { parse_mode: "HTML", reply_markup: keyboard })
      .catch(() => {});

  // Tombol TAKE / DROP di pesan job
  bot.on("callback_query:data", async (ctx) => {
    const [action, orderId] = ctx.callbackQuery.data.split(":");
    const msg = ctx.callbackQuery.message;

    if (
      !msg ||
      !["take", "drop"].includes(action) ||
      !mongoose.isValidObjectId(orderId) ||
      (groupId && msg.chat.id !== groupId)
    )
      return ctx.answerCallbackQuery();

    const from = ctx.from;
    const name = resolveWorkerName(from);
    if (!name) return ctx.answerCallbackQuery();
    const meta = { telegramId: from.id, username: from.username || null };
    const alert = (text) =>
      ctx.answerCallbackQuery({ text, show_alert: true });

    if (action === "take") {
      const r = await orderService.takeJob(
        orderId,
        msg.message_id,
        name,
        from.id,
        meta,
      );
      if (r.status === "expired")
        return alert("Pesan ini sudah tidak berlaku. Pakai pesan terbaru.");
      if (r.status === "taken") {
        await alert(`Job ini sudah diambil ${r.by}.`);
        return editMsg(
          ctx,
          `${r.order.telegram?.text || ""}\n\n✅ <b>DIAMBIL: ${esc(r.by)}</b>`,
          dropKeyboard(orderId),
        );
      }
      await ctx.answerCallbackQuery({ text: "Berhasil di-take." });
      return editMsg(
        ctx,
        `${r.order.telegram?.text || ""}\n\n✅ <b>DIAMBIL: ${esc(name)}</b>`,
        dropKeyboard(orderId),
      );
    }

    // drop
    const r = await orderService.dropJob(orderId, msg.message_id, from.id, meta);
    if (r.status === "expired")
      return alert("Pesan ini sudah tidak berlaku.");
    if (r.status === "not_owner") return alert("Ini bukan job kamu.");
    if (r.status === "locked")
      return alert("Tidak bisa drop: sudah ada ID admin atau sudah dibayar.");

    await ctx.answerCallbackQuery({ text: "Job dilepas." });
    return editMsg(
      ctx,
      r.order.telegram?.text || "",
      takeKeyboard(orderId, r.order.customerName),
    );
  });

  bot.catch((err) => {
    console.error("[BOT ERROR]", err.error?.message || err.message);
  });

  return bot;
};

module.exports = { createBot };