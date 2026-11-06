const crypto = require('node:crypto');
const path = require('node:path');
const bcrypt = require('bcryptjs');
const dotenv = require('dotenv');

dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient({
  log: ['error'],
});

const initialAccounts = [
  {
    fullName: 'Iroda Abdurazzaqova',
    login: 'iroda',
    role: 'ADMIN',
    type: 'user',
  },
  {
    fullName: 'Berdiqulov Erali Asatullayevich',
    login: 'erali',
    role: 'MANAGER',
    type: 'user',
  },
  {
    fullName: 'Berdiqulov Erali Asatullayevich',
    login: 'berdiqulov',
    role: 'TEACHER',
    type: 'teacher',
    phone: '',
    subject: 'Ingliz tili va IELTS',
    groupName: 'IELTS',
  },
  {
    fullName: 'Narzullayeva Fazilat Baxtiyor qizi',
    login: 'narzullayeva',
    role: 'TEACHER',
    type: 'teacher',
    phone: '',
    subject: 'Ingliz tili va CEFR',
    groupName: 'CEFR',
  },
  {
    fullName: 'Ashirqulova Kamola Arslon qizi',
    login: 'ashirqulova',
    role: 'TEACHER',
    type: 'teacher',
    phone: '',
    subject: 'Ingliz tili va CEFR',
    groupName: 'CEFR (Grammar & Speaking)',
  },
  {
    fullName: 'Shomirzayeva Muhlisa Berdiyor qizi',
    login: 'shomirzayeva',
    role: 'TEACHER',
    type: 'teacher',
    phone: '',
    subject: 'Ingliz tili',
    groupName: 'Ingliz tili',
  },
  {
    fullName: 'Absatov Soibnazar Abdullayevich',
    login: 'absatov',
    role: 'TEACHER',
    type: 'teacher',
    phone: '',
    subject: 'Matematika',
    groupName: 'Matematika',
  },
  {
    fullName: "Mustafoqulov Diyorbek Elmurod o'g'li",
    login: 'mustafoqulov',
    role: 'TEACHER',
    type: 'teacher',
    phone: '',
    subject: 'Matematika',
    groupName: 'Matematika (2-guruh)',
  },
  {
    fullName: 'Xolmatova Aynur Abbos qizi',
    login: 'xolmatova',
    role: 'TEACHER',
    type: 'teacher',
    phone: '',
    subject: 'Rus tili',
    groupName: 'Rus tili',
  },
  {
    fullName: "Umarov Sirojiddin Maxmud o'g'li",
    login: 'umarov',
    role: 'TEACHER',
    type: 'teacher',
    phone: '',
    subject: 'Koreys tili',
    groupName: 'Koreys tili',
  },
  {
    fullName: "Saidqulov Farrux Shavkat o'g'li",
    login: 'saidqulov',
    role: 'TEACHER',
    type: 'teacher',
    phone: '',
    subject: 'Ona tili va adabiyot',
    groupName: 'Ona tili va adabiyot',
  },
];

function describeDatabase(databaseUrl) {
  if (!databaseUrl) {
    throw new Error('DATABASE_URL environment o\'zgaruvchisi ko\'rsatilmagan.');
  }

  let url;
  try {
    url = new URL(databaseUrl);
  } catch {
    throw new Error('DATABASE_URL yaroqli PostgreSQL ulanish manzili bo\'lishi kerak.');
  }

  if (!['postgres:', 'postgresql:'].includes(url.protocol)) {
    throw new Error('DATABASE_URL PostgreSQL ulanish manzili bo\'lishi kerak.');
  }

  return `host=${url.hostname}, database=${decodeURIComponent(url.pathname.slice(1) || 'aniqlanmadi')}`;
}

function createTemporaryPassword() {
  return crypto.randomBytes(24).toString('base64url');
}

async function main() {
  console.log(`Ulanilayotgan baza: ${describeDatabase(process.env.DATABASE_URL)}`);

  const credentialsToPrint = [];
  const result = await prisma.$transaction(async (tx) => {
    const created = [];
    const skipped = [];

    for (const account of initialAccounts) {
      const existing = await tx.user.findUnique({
        where: { login: account.login },
        select: { id: true },
      });

      if (existing) {
        skipped.push(account.login);
        continue;
      }

      const password = createTemporaryPassword();
      const passwordHash = await bcrypt.hash(password, 10);
      const user = await tx.user.create({
        data: {
          fullName: account.fullName,
          login: account.login,
          passwordHash,
          role: account.role,
          ...(account.type === 'teacher'
            ? {
                teacherProfile: {
                  create: {
                    phone: account.phone,
                    subject: account.subject,
                  },
                },
              }
            : {}),
        },
        ...(account.type === 'teacher'
          ? { select: { teacherProfile: { select: { id: true } } } }
          : { select: { id: true } }),
      });

      if (account.type === 'teacher') {
        await tx.group.create({
          data: {
            name: account.groupName,
            teacherId: user.teacherProfile.id,
            schedule: 'Jadval belgilanmagan',
          },
        });
      }

      created.push(account.login);
      credentialsToPrint.push({ login: account.login, password });
    }

    return { created, skipped };
  }, { maxWait: 10000, timeout: 30000 });

  console.log(`Yaratildi: ${result.created.length} akkaunt (${result.created.join(', ') || 'yo\'q'}).`);
  console.log(`Mavjud loginlar sabab o'tkazib yuborildi: ${result.skipped.length} (${result.skipped.join(', ') || 'yo\'q'}).`);

  if (credentialsToPrint.length > 0) {
    console.log('\nYangi akkauntlar uchun vaqtinchalik parollar (bu ro\'yxat faqat bir marta chiqariladi):');
    for (const { login, password } of credentialsToPrint) {
      console.log(`${login}\t${password}`);
    }
    console.log('\nParollarni xavfsiz joyga saqlang; bazada faqat bcrypt hash saqlangan.');
  } else {
    console.log('Yangi akkaunt yaratilmagan; mavjud parollarga tegilmadi.');
  }
}

main()
  .catch((error) => {
    console.error('Boshlang\'ich akkauntlarni yaratishda xatolik:', error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
