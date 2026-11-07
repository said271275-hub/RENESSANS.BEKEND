import { sendMessage, sendPhoneRequest, removeKeyboard, getUpdates } from './telegramService';
import prisma from '../prisma';

let offset = 0;
// chatId -> holatini saqlash
const pendingRegistrations = new Map<string, 'waiting_phone'>();

async function linkParent(chatId: string, phone: string): Promise<void> {
  const rawPhone = phone.replace(/\s|-/g, '');

  // Turli formatdagi raqamlarni qidirish
  const phoneVariants = [
    rawPhone,
    rawPhone.startsWith('+') ? rawPhone.slice(1) : '+' + rawPhone,
    rawPhone.startsWith('+998') ? '0' + rawPhone.slice(4) : rawPhone,
    rawPhone.startsWith('0') ? '+998' + rawPhone.slice(1) : rawPhone,
    rawPhone.startsWith('998') ? '+' + rawPhone : rawPhone,
  ];

  const students = await prisma.student.findMany({
    where: { parentPhone: { in: phoneVariants } },
  });

  if (students.length === 0) {
    await removeKeyboard(
      chatId,
      `❌ <b>Raqam topilmadi!</b>\n\n` +
      `<code>${phone}</code> raqami tizimda ro'yxatdan o'tmagan.\n\n` +
      `Iltimos, administrator bilan bog'laning yoki to'g'ri raqam kiriting.`
    );
    // Tugmani qayta ko'rsatish
    await sendPhoneRequest(
      chatId,
      `📱 Yoki quyidagi tugmani bosib telefon raqamingizni yuboring:`
    );
    return;
  }

  // Barcha mos kelgan o'quvchilarga chatId ni bog'lash
  await prisma.student.updateMany({
    where: { parentPhone: { in: phoneVariants } },
    data: { parentTelegramChatId: chatId },
  });

  const studentNames = students.map(s => `• <b>${s.fullName}</b>`).join('\n');
  await removeKeyboard(
    chatId,
    `✅ <b>Muvaffaqiyatli ulandi!</b>\n\n` +
    `Quyidagi o'quvchi(lar) uchun xabarnomalar yoqildi:\n\n${studentNames}\n\n` +
    `Endi davomat va to'lov eslatmalari shu chatga keladi. 🎉`
  );
  pendingRegistrations.delete(chatId);
}

async function processUpdate(update: any): Promise<void> {
  const message = update.message;
  if (!message) return;

  const chatId = String(message.chat.id);
  const firstName = message.chat.first_name || 'Ota-ona';

  // Ota-ona "Telefon raqamimni yuborish" tugmasini bosdi (contact)
  if (message.contact) {
    const phone = message.contact.phone_number;
    await linkParent(chatId, phone.startsWith('+') ? phone : '+' + phone);
    return;
  }

  const text = (message.text || '').trim();

  // /start buyrug'i
  if (text === '/start' || text.startsWith('/start ')) {
    pendingRegistrations.set(chatId, 'waiting_phone');
    await sendPhoneRequest(
      chatId,
      `👋 Assalomu alaykum, <b>${firstName}</b>!\n\n` +
      `🏫 <b>RENESSANS O'quv Markazi</b> botiga xush kelibsiz!\n\n` +
      `Bu bot orqali farzandingizning:\n` +
      `✅ Davomat holati\n` +
      `💳 To'lov eslatmalari\n\n` +
      `haqida xabarnomalar olasiz.\n\n` +
      `📱 Quyidagi tugmani bosing yoki telefon raqamingizni yozing:`
    );
    return;
  }

  // Matn orqali telefon raqam yuborildi
  if (pendingRegistrations.get(chatId) === 'waiting_phone' && text) {
    await linkParent(chatId, text);
    return;
  }

  // Noma'lum xabar
  await sendMessage(
    chatId,
    `ℹ️ Botdan foydalanish uchun /start buyrug'ini yuboring.`
  );
}

export async function startBotPolling(): Promise<void> {
  if (!process.env.BOT_TOKEN) {
    console.log('[Bot] BOT_TOKEN topilmadi — bot polling ishlamaydi.');
    return;
  }

  console.log('[Bot] Telegram bot polling ishga tushdi...');

  const poll = async () => {
    try {
      const updates = await getUpdates(offset);
      for (const update of updates) {
        offset = update.update_id + 1;
        await processUpdate(update).catch((err) =>
          console.error('[Bot] Update qayta ishlashda xatolik:', err)
        );
      }
    } catch (err) {
      console.error('[Bot] Polling xatosi:', err);
    }
    setTimeout(poll, 2000);
  };

  poll();
}
