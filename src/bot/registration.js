// src/bot/registration.js
// Tambahan untuk bot: pendaftaran worker (kode sekali pakai), /summary, /grup,
// persetujuan join grup, tombol shortcut, dan penjaga tombol TAKE/DROP.
// Handler TAKE/DROP asli di bot/index.js tidak diubah, hanya dilewati lewat middleware ini.
const { InlineKeyboard, Keyboard } = require("grammy");
const registry = require("../services/workerRegistry.service");
const { esc } = require("../services/telegram.service");

const HTML = { parse_mode: "HTML" };
const GROUP_LINK_TTL_SEC = 10 * 60;

const getGroupId = () =>
  process.env.TELEGRAM_GROUP_ID ? Number(process.env.TELEGRAM_GROUP_ID) : null;
const isPrivate = (ctx) => ctx.chat?.type === "private";
const fmtRp = (n) => `Rp${Number(n || 0).toLocaleString("id-ID")}`;
const isMember = (m) =>
  ["creator", "administrator", "member"].includes(m.status) ||
  (m.status === "restricted" && m.is_member);

const HELP_TEXT = [
  "<b>Perintah worker</b>",
  "/daftar KODE — daftar sebagai worker",
  "/summary — ringkasan season aktif (tambah <code>semua</code> untuk semua season)",
  "/grup — minta link grup drop job",
].join("\n");

const NOT_REGISTERED =
  "Kamu belum terdaftar sebagai worker.\nKirim /start lalu tekan Daftar dan masukkan kode dari admin.";

const REGISTER_PROMPT = "Silakan masukkan kode yang diberikan admin";

// ── Tombol shortcut di bawah chat ──
const BTN_DAFTAR = "Daftar";
const BTN_SUMMARY = "Summary";
const BTN_SUMMARY_ALL = "Semua Season";
const BTN_GRUP = "Grup";
const BTN_HELP = "Bantuan";

// Keyboard untuk akun yang belum terdaftar
const guestKeyboard = () => new Keyboard().text(BTN_DAFTAR).resized().persistent();

// Keyboard untuk worker terdaftar
const workerKeyboard = () =>
  new Keyboard()
    .text(BTN_SUMMARY)
    .text(BTN_SUMMARY_ALL)
    .row()
    .text(BTN_GRUP)
    .text(BTN_HELP)
    .resized()
    .persistent();

const withKeyboard = () => ({ ...HTML, reply_markup: workerKeyboard() });
const withGuestKeyboard = () => ({ ...HTML, reply_markup: guestKeyboard() });

// ── Link grup sekali klik, tapi tetap butuh persetujuan bot ──
const sendGroupLink = async (ctx, worker) => {
  const groupId = getGroupId();
  if (!groupId)
    return ctx.reply("Link grup belum dikonfigurasi. Hubungi owner.");

  try {
    const member = await ctx.api
      .getChatMember(groupId, ctx.from.id)
      .catch(() => null);
    if (member && isMember(member))
      return ctx.reply("Kamu sudah ada di grup drop job.");

    // cabut link lama supaya tidak menumpuk
    const old = await registry.getStoredGroupLink(worker._id);
    if (old) await ctx.api.revokeChatInviteLink(groupId, old).catch(() => {});

    const link = await ctx.api.createChatInviteLink(groupId, {
      name: worker.name.slice(0, 32),
      creates_join_request: true,
      expire_date: Math.floor(Date.now() / 1000) + GROUP_LINK_TTL_SEC,
    });
    await registry.saveGroupLink(worker._id, link.invite_link);

    return ctx.reply(
      "Tekan tombol di bawah untuk masuk grup drop job.\n" +
        "Link berlaku 10 menit. Permintaan masuk hanya disetujui untuk akunmu, " +
        "jadi kalau link dikirim ke orang lain akan otomatis ditolak.",
      {
        reply_markup: new InlineKeyboard().url(
          "MASUK GRUP DROP JOB",
          link.invite_link,
        ),
      },
    );
  } catch (err) {
    console.error("[BOT] gagal buat link grup:", err.message);
    return ctx.reply(
      "Gagal membuat link grup. Hubungi owner (bot harus admin grup dengan izin Invite Users).",
    );
  }
};

const buildSummaryText = (worker, s) => {
  const lines = [
    `📊 <b>RINGKASAN ${esc(worker.name)} - ${esc(s.scope)}</b>`,
    "",
    `Total Job: ${s.job.count}`,
    `ID Belum dibayar: ${s.unpaid.count} ID`,
    `Belum dibayar: ${fmtRp((s.job.unpaid || 0) + (s.ids.feeUnpaid || 0))}`,
    `Sudah dibayar: ${fmtRp((s.job.paid || 0) + (s.ids.feePaid || 0))}`,
    `Total Gaji: ${fmtRp((s.job.total || 0) + (s.ids.feeTotal || 0))}`,
  ];

  if (s.unpaid.list.length > 0) {
    lines.push("", "<b>Rincian ID belum dibayar</b>");
    s.unpaid.list.forEach((d, i) => {
      const tag = s.scopeAll ? `[${esc(d.seasonName)}] ` : "";
      lines.push(`${i + 1}. ${tag}${esc(d.customerName)}: ${fmtRp(d.amount)}`);
    });
  }
  return lines;
};

// Telegram membatasi 4096 karakter per pesan; pecah per baris kalau rincian panjang
const replyChunked = async (ctx, lines) => {
  const chunks = [];
  let cur = "";
  for (const line of lines) {
    if (cur.length + line.length + 1 > 3800) {
      chunks.push(cur);
      cur = "";
    }
    cur += (cur ? "\n" : "") + line;
  }
  if (cur) chunks.push(cur);
  for (let i = 0; i < chunks.length; i++) {
    const last = i === chunks.length - 1;
    await ctx.reply(chunks[i], last ? withKeyboard() : HTML);
  }
};

const sendSummary = async (ctx, allSeasons) => {
  const worker = await registry.getActiveByTelegramId(ctx.from.id);
  if (!worker) return ctx.reply(NOT_REGISTERED, withGuestKeyboard());
  try {
    const s = await registry.getSelfSummary(worker.name, { allSeasons });
    return replyChunked(ctx, buildSummaryText(worker, s));
  } catch (err) {
    console.error("[BOT] gagal summary:", err.message);
    return ctx.reply("Gagal mengambil ringkasan. Coba lagi nanti.");
  }
};

const sendGroup = async (ctx) => {
  const worker = await registry.getActiveByTelegramId(ctx.from.id);
  if (!worker) return ctx.reply(NOT_REGISTERED, withGuestKeyboard());
  return sendGroupLink(ctx, worker);
};

// Proses kode daftar (dipakai /daftar KODE dan tombol Daftar)
const processCode = async (ctx, code) => {
  const r = await registry.registerByCode(ctx.from, code);
  if (r.status === "blocked")
    return ctx.reply(
      "Terlalu banyak percobaan salah. Coba lagi 15 menit lagi.",
      withGuestKeyboard(),
    );
  if (r.status === "invalid")
    return ctx.reply(
      "Kode tidak valid atau sudah kedaluwarsa. Minta kode baru ke admin, lalu tekan Daftar lagi.",
      withGuestKeyboard(),
    );
  if (r.status === "already")
    return ctx.reply(
      `Akun Telegram ini sudah terdaftar${r.worker ? ` sebagai ${r.worker.name}` : ""}.`,
      { reply_markup: workerKeyboard() },
    );

  await ctx.reply(
    `✅ <b>Terverifikasi!</b>\nKamu terdaftar sebagai <b>${esc(r.worker.name)}</b>.\n\n${HELP_TEXT}`,
    withKeyboard(),
  );
  return sendGroupLink(ctx, r.worker);
};

const registerWorkerHandlers = (bot) => {
  // ── Penjaga tombol TAKE / DROP ─────────────────────────────
  // Jalan sebelum handler asli. Kalau akun terdaftar, nama worker resmi dipakai
  // (ctx.workerName). Kalau WORKER_REGISTRATION_REQUIRED=true, akun yang belum
  // terdaftar ditolak. Kalau false, perilaku lama tetap jalan seperti biasa.
  bot.on("callback_query:data", async (ctx, next) => {
    const action = ctx.callbackQuery.data.split(":")[0];
    if (!["take", "drop"].includes(action)) return next();

    const required = process.env.WORKER_REGISTRATION_REQUIRED === "true";
    let worker = null;
    try {
      worker = await registry.getActiveByTelegramId(ctx.from.id);
    } catch (err) {
      console.error("[BOT] gagal cek worker:", err.message);
      if (required)
        return ctx.answerCallbackQuery({
          text: "Terjadi kesalahan. Coba lagi.",
          show_alert: true,
        });
      return next();
    }

    if (!worker && required)
      return ctx.answerCallbackQuery({
        text: "Kamu belum terdaftar sebagai worker. Daftar dulu lewat chat pribadi ke bot.",
        show_alert: true,
      });

    if (worker) ctx.workerName = worker.name;
    return next();
  });

  // ── /start dan /daftar ─────────────────────────────────────
  const handleRegister = async (ctx) => {
    const code = String(ctx.match || "").trim();

    if (!isPrivate(ctx)) {
      // kode tidak boleh dikirim di grup
      if (code) {
        ctx.deleteMessage().catch(() => {});
        await ctx.reply(
          "Pendaftaran hanya lewat chat pribadi ke bot. Jangan kirim kode di grup.",
        );
      }
      return;
    }

    if (!code) {
      const mine = await registry.getByTelegramId(ctx.from.id);
      if (mine)
        return ctx.reply(
          `Kamu terdaftar sebagai <b>${esc(mine.name)}</b>.\n\n${HELP_TEXT}`,
          withKeyboard(),
        );
      return ctx.reply(
        "Halo! Bot ini khusus worker.\n\nTekan tombol <b>Daftar</b> di bawah, lalu masukkan kode dari admin.",
        withGuestKeyboard(),
      );
    }

    return processCode(ctx, code);
  };
  bot.command("start", handleRegister);
  bot.command("daftar", handleRegister);

  // ── /help ──────────────────────────────────────────────────
  bot.command("help", (ctx) => {
    if (!isPrivate(ctx)) return;
    return ctx.reply(HELP_TEXT, withKeyboard());
  });

  // ── /summary ───────────────────────────────────────────────
  bot.command("summary", (ctx) => {
    if (!isPrivate(ctx)) return;
    const allSeasons = /^(semua|all)$/i.test(String(ctx.match || "").trim());
    return sendSummary(ctx, allSeasons);
  });

  // ── /grup ──────────────────────────────────────────────────
  bot.command("grup", (ctx) => {
    if (!isPrivate(ctx)) return;
    return sendGroup(ctx);
  });

  // ── Tombol shortcut (pesan teks dari reply keyboard) ───────
  bot.hears(BTN_DAFTAR, async (ctx) => {
    if (!isPrivate(ctx)) return;
    const mine = await registry.getByTelegramId(ctx.from.id);
    if (mine)
      return ctx.reply(
        `Kamu sudah terdaftar sebagai <b>${esc(mine.name)}</b>.`,
        withKeyboard(),
      );
    return ctx.reply(REGISTER_PROMPT, {
      reply_markup: {
        force_reply: true,
        input_field_placeholder: "Kode dari admin",
      },
    });
  });
  bot.hears(BTN_SUMMARY, (ctx) => isPrivate(ctx) && sendSummary(ctx, false));
  bot.hears(BTN_SUMMARY_ALL, (ctx) => isPrivate(ctx) && sendSummary(ctx, true));
  bot.hears(BTN_GRUP, (ctx) => isPrivate(ctx) && sendGroup(ctx));
  bot.hears(
    BTN_HELP,
    (ctx) => isPrivate(ctx) && ctx.reply(HELP_TEXT, withKeyboard()),
  );

  // ── Balasan untuk prompt "masukkan kode" ───────────────────
  // Tanpa state di memori: dikenali dari fakta bahwa pesan ini membalas prompt bot.
  bot.on("message:text", async (ctx) => {
    if (!isPrivate(ctx)) return;
    const replied = ctx.message.reply_to_message;
    if (
      !replied ||
      replied.from?.id !== ctx.me.id ||
      replied.text !== REGISTER_PROMPT
    )
      return;
    ctx.deleteMessage().catch(() => {}); // hapus pesan berisi kode
    return processCode(ctx, ctx.message.text.trim());
  });

  // ── Persetujuan masuk grup: hanya akun worker terdaftar & aktif ──
  bot.on("chat_join_request", async (ctx) => {
    const req = ctx.chatJoinRequest;
    const groupId = getGroupId();
    if (!groupId || req.chat.id !== groupId) return;

    let worker = null;
    try {
      worker = await registry.getActiveByTelegramId(req.from.id);
    } catch (err) {
      console.error("[BOT] gagal cek join request:", err.message);
      return; // biarkan pending, jangan approve/decline saat error
    }

    try {
      if (worker) {
        await ctx.api.approveChatJoinRequest(req.chat.id, req.from.id);
        ctx.api
          .sendMessage(
            req.user_chat_id,
            `✅ Permintaan masuk grup disetujui. Selamat bekerja, ${worker.name}!`,
          )
          .catch(() => {});
      } else {
        await ctx.api.declineChatJoinRequest(req.chat.id, req.from.id);
      }
    } catch (err) {
      console.error("[BOT] gagal proses join request:", err.message);
    }
  });
};

// Menu command + teks petunjuk di chat kosong (tidak mengganggu deleteMyCommands
// di polling.js, karena itu hanya menghapus scope default)
const setupWorkerCommands = (bot) =>
  Promise.all([
    bot.api.setMyCommands([{ command: "start", description: "Buka menu" }], {
      scope: { type: "all_private_chats" },
    }),
    // tampil di chat kosong ("What can this bot do?")
    bot.api.setMyDescription(
      "Bot khusus worker JOKI CALM.\n\nTekan START atau kirim /start, lalu pilih Daftar dan masukkan kode yang diberikan admin.",
    ),
    // tampil di profil bot
    bot.api.setMyShortDescription("Bot worker JOKI CALM. Kirim /start untuk mulai."),
  ]);

module.exports = { registerWorkerHandlers, setupWorkerCommands };