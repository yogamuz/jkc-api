const { Api, InlineKeyboard } = require("grammy");
const Order = require("../models/order.model");

const esc = (s) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
// kapital dulu, baru escape (supaya &amp; tidak jadi &AMP;)
const U = (s) => esc(String(s).toUpperCase());

const toPlain = (m) => (m instanceof Map ? Object.fromEntries(m) : m || {});

const fail = (message, statusCode) => {
  const e = new Error(message);
  e.statusCode = statusCode;
  return e;
};

const takeKeyboard = (orderId, customerName) =>
  new InlineKeyboard().text(
    `TAKE ${String(customerName).toUpperCase().slice(0, 30)}`,
    `take:${orderId}`,
  );

const dropKeyboard = (orderId) =>
  new InlineKeyboard().text("DROP", `drop:${orderId}`);

const buildMessage = (order) => {
  const pj = order.pendingJob || {};
  const cat = String(order.category || "").toUpperCase();
  const isRank = cat.includes("RANK");
  const jokiLabel = cat.replace(/^JOKI\s*/, "") || "-";

  const rank = toPlain(pj.rankBreakdown);
  const bonus = toPlain(pj.bonusBreakdown);
  const starLines = Object.entries(rank)
    .filter(([, v]) => v > 0)
    .map(([tier, v]) =>
      bonus[tier] > 0
        ? `- ${U(tier)} ${v} + ${bonus[tier]}`
        : `- ${U(tier)} ${v}`,
    );

  const when =
    new Date(order.date).toLocaleString("id-ID", {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "Asia/Jakarta",
    }) + " WIB";

  const fee = pj.salary > 0 ? "RP " + pj.salary.toLocaleString("id-ID") : "-";
  const note = order.keterangan ? U(order.keterangan) : "-";

  const lines = ["📢 <b>JOB BARU</b>", ""];
  lines.push(`<b>CUSTOMER:</b> ${U(order.customerName)}`);

  if (isRank) {
    lines.push(`<b>TGL &amp; JAM:</b> ${U(when)}`);
    lines.push(`<b>JOKI:</b> ${U(jokiLabel)}`);
    lines.push(`<b>STAR:</b>${starLines.length ? "" : " -"}`);
    lines.push(...starLines);
  } else {
    lines.push(`<b>JOKI:</b> ${U(jokiLabel)}`);
  }

  lines.push(`<b>FEE:</b> ${fee}`);
  lines.push(`<b>NOTE:</b> ${note}`);
  lines.push(`<b>STATUS:</b> ${U(order.status)}`);

  return lines.join("\n");
};

const sendJobToTelegram = async (orderId) => {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const groupId = process.env.TELEGRAM_GROUP_ID;
  if (!token || !groupId)
    throw fail("TELEGRAM_BOT_TOKEN / TELEGRAM_GROUP_ID belum diset.", 500);

  const order = await Order.findById(orderId);
  if (!order) throw fail("Order tidak ditemukan.", 404);
  if (order.workers.length > 0)
    throw fail("Job ini sudah punya worker.", 409);

  const api = new Api(token);

  // pesan lama untuk order ini: hapus tombolnya supaya tidak ada dobel
  if (order.telegram?.messageId && order.telegram?.chatId) {
    await api
      .editMessageReplyMarkup(order.telegram.chatId, order.telegram.messageId, {
        reply_markup: { inline_keyboard: [] },
      })
      .catch(() => {});
  }

  const text = buildMessage(order);
  const sent = await api.sendMessage(Number(groupId), text, {
    parse_mode: "HTML",
    reply_markup: takeKeyboard(order._id, order.customerName),
  });

  await Order.updateOne(
    { _id: order._id },
    {
      $set: {
        "telegram.chatId": sent.chat.id,
        "telegram.messageId": sent.message_id,
        "telegram.sentAt": new Date(),
        "telegram.takenBy": null,
        "telegram.text": text,
      },
    },
  );

  return { chatId: sent.chat.id, messageId: sent.message_id };
};

module.exports = { sendJobToTelegram, takeKeyboard, dropKeyboard, esc };