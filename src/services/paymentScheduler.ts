import cron from 'node-cron';
import prisma from '../prisma';
import { sendMessage } from './telegramService';

function getCurrentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

async function sendPaymentReminders(): Promise<void> {
  const currentMonth = getCurrentMonth();
  console.log(`[Scheduler] ${currentMonth} uchun to'lov eslatmalari yuborilmoqda...`);

  try {
    // Shu oy uchun to'lov qilmagan va Telegram ga ulangan ota-onalar
    const students = await prisma.student.findMany({
      where: {
        parentTelegramChatId: { not: null },
        monthlyFee: { gt: 0 },
        payments: {
          none: {
            month: currentMonth,
            status: "TO'LANGAN",
          },
        },
      },
      include: { group: true },
    });

    for (const student of students) {
      if (!student.parentTelegramChatId) continue;

      const text =
        `💳 <b>To'lov eslatmasi</b>\n\n` +
        `Hurmatli ota-ona!\n\n` +
        `Farzandingiz <b>${student.fullName}</b> uchun ` +
        `<b>${currentMonth}</b> oyi darsi to'lovi hali amalga oshirilmagan.\n\n` +
        `📚 Guruh: <b>${student.group?.name || "Noma'lum"}</b>\n` +
        `💰 To'lov miqdori: <b>${student.monthlyFee.toLocaleString('uz-UZ')} so'm</b>\n\n` +
        `Iltimos, o'quv markaz bilan bog'laning yoki to'lovni amalga oshiring.`;

      await sendMessage(student.parentTelegramChatId, text);
    }

    console.log(`[Scheduler] ${students.length} ta ota-onaga to'lov eslatmasi yuborildi.`);
  } catch (error) {
    console.error('[Scheduler] To\'lov eslatmasi yuborishda xatolik:', error);
  }
}

export function startPaymentScheduler(): void {
  if (!process.env.BOT_TOKEN) {
    console.log('[Scheduler] BOT_TOKEN topilmadi — scheduler ishlamaydi.');
    return;
  }

  // Har oyning 10-sanasida soat 09:00 da (Toshkent vaqti)
  cron.schedule('0 9 10 * *', async () => {
    console.log('[Scheduler] 10-sana eslatmasi...');
    await sendPaymentReminders();
  }, { timezone: 'Asia/Tashkent' });

  // Har oyning 15-sanasida soat 09:00 da
  cron.schedule('0 9 15 * *', async () => {
    console.log('[Scheduler] 15-sana eslatmasi...');
    await sendPaymentReminders();
  }, { timezone: 'Asia/Tashkent' });

  // Har oyning 25-sanasida soat 09:00 da
  cron.schedule('0 9 25 * *', async () => {
    console.log('[Scheduler] 25-sana eslatmasi...');
    await sendPaymentReminders();
  }, { timezone: 'Asia/Tashkent' });

  console.log('[Scheduler] To\'lov eslatmasi scheduler ishga tushdi (10, 15, 25 sanalar — soat 09:00 Toshkent).');
}
