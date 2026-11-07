const BOT_TOKEN = process.env.BOT_TOKEN;
const BASE_URL = `https://api.telegram.org/bot${BOT_TOKEN}`;

/**
 * Telegram chat ga xabar yuboradi
 */
export async function sendMessage(chatId: string, text: string): Promise<void> {
  if (!BOT_TOKEN) return;
  try {
    const res = await fetch(`${BASE_URL}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: 'HTML',
      }),
    });
    if (!res.ok) {
      const err = await res.json() as any;
      console.error(`[Telegram] Xabar yuborishda xatolik (chatId=${chatId}):`, err.description);
    }
  } catch (error) {
    console.error('[Telegram] Network xatosi:', error);
  }
}

/**
 * Yangi bot update larni oladi (long polling)
 */
export async function getUpdates(offset: number): Promise<any[]> {
  if (!BOT_TOKEN) return [];
  try {
    const res = await fetch(`${BASE_URL}/getUpdates?offset=${offset}&timeout=25&allowed_updates=message`);
    const data = await res.json() as any;
    return data.ok ? data.result : [];
  } catch (error) {
    console.error('[Telegram] getUpdates xatosi:', error);
    return [];
  }
}

/**
 * Kelmagan o'quvchilarning ota-onalariga xabar yuboradi
 */
export async function notifyAbsentParents(
  absentStudents: Array<{ id: number; fullName: string; parentTelegramChatId: string | null }>,
  groupName: string,
  date: string,
  statusMap: Map<number, string>
): Promise<void> {
  for (const student of absentStudents) {
    if (!student.parentTelegramChatId) continue;

    const status = statusMap.get(student.id) || 'KELMADI';
    const statusText = status === 'SABABLI' ? 'sababli kelmadi ❗' : 'kelmadi ❌';

    const text =
      `📢 <b>Davomat xabarnomasi</b>\n\n` +
      `Hurmatli ota-ona!\n\n` +
      `Farzandingiz <b>${student.fullName}</b> bugun (${date}) darsga <b>${statusText}</b>.\n\n` +
      `📚 Guruh: <b>${groupName}</b>\n\n` +
      `Qo'shimcha ma'lumot uchun o'quv markaz bilan bog'laning.`;

    await sendMessage(student.parentTelegramChatId, text);
  }
}
