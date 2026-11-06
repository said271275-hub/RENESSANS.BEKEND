const crypto = require('node:crypto');
const path = require('node:path');
const bcrypt = require('bcryptjs');
const dotenv = require('dotenv');

const backendDirectory = path.resolve(__dirname, '..');
dotenv.config({ path: path.join(backendDirectory, '.env') });

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const teachers = [
  {
    fullName: 'Berdiqulov Erali Asatullayevich',
    login: 'berdiqulov',
    subject: 'Ingliz tili va IELTS',
    groupName: 'IELTS',
  },
  {
    fullName: 'Narzullayeva Fazilat Baxtiyor qizi',
    login: 'narzullayeva',
    subject: 'Ingliz tili va CEFR',
    groupName: 'CEFR',
  },
  {
    fullName: 'Ashirqulova Kamola Arslon qizi',
    login: 'ashirqulova',
    subject: 'Ingliz tili va CEFR',
    groupName: 'CEFR (Grammar & Speaking)',
  },
  {
    fullName: 'Shomirzayeva Muhlisa Berdiyor qizi',
    login: 'shomirzayeva',
    subject: 'Ingliz tili',
    groupName: 'Ingliz tili',
  },
  {
    fullName: 'Absatov Soibnazar Abdullayevich',
    login: 'absatov',
    subject: 'Matematika',
    groupName: 'Matematika',
  },
  {
    fullName: "Mustafoqulov Diyorbek Elmurod o'g'li",
    login: 'mustafoqulov',
    subject: 'Matematika',
    groupName: 'Matematika (2-guruh)',
  },
  {
    fullName: 'Xolmatova Aynur Abbos qizi',
    login: 'xolmatova',
    subject: 'Rus tili',
    groupName: 'Rus tili',
  },
  {
    fullName: "Umarov Sirojiddin Maxmud o'g'li",
    login: 'umarov',
    subject: 'Koreys tili',
    groupName: 'Koreys tili',
  },
  {
    fullName: "Saidqulov Farrux Shavkat o'g'li",
    login: 'saidqulov',
    subject: 'Ona tili va adabiyot',
    groupName: 'Ona tili va adabiyot',
  },
];

const countModels = [
  ['O\'quvchilar', 'student'],
  ['To\'lovlar', 'payment'],
  ['Davomat', 'attendance'],
  ['Reytinglar', 'grade'],
  ['Maosh hisoblari', 'teacherPayroll'],
  ['Moliya yozuvlari (Kirim/Chiqim)', 'transaction'],
  ['Guruhlar', 'group'],
  ['O\'qituvchilar', 'teacher'],
  ['O\'qituvchi akkauntlari', 'teacherUser'],
  ['Admin/Manager akkauntlari (saqlanadi)', 'staffUser'],
  ['Boshqa rollar (saqlanadi)', 'otherUsers'],
];

function getDatabaseTarget(databaseUrl) {
  if (!databaseUrl) {
    throw new Error('DATABASE_URL environment o\'zgaruvchisi ko\'rsatilmagan.');
  }

  if (/^postgres(?:ql)?:\/\//i.test(databaseUrl)) {
    const parsed = new URL(databaseUrl);
    const isProduction = /neon\.tech|neondatabase|production/i.test(parsed.hostname);
    return {
      display: `PostgreSQL host=${parsed.hostname}, database=${parsed.pathname.slice(1) || 'aniqlanmadi'}`,
      isProduction,
      provider: 'postgresql',
      supported: true,
    };
  }

  if (databaseUrl.startsWith('file:')) {
    const fileValue = databaseUrl.slice('file:'.length).split('?')[0];
    const databasePath = path.isAbsolute(fileValue)
      ? path.resolve(fileValue)
      : path.resolve(backendDirectory, 'prisma', fileValue);

    return {
      display: `SQLite fayl=${databasePath}`,
      isProduction: false,
      provider: 'sqlite',
      supported: false,
    };
  }

  throw new Error('DATABASE_URL PostgreSQL ulanish satri bo\'lishi kerak.');
}

async function getCounts(client) {
  const [
    students,
    payments,
    attendances,
    grades,
    payrolls,
    transactions,
    groups,
    teachersCount,
    teacherUsers,
    staffUsers,
    otherUsers,
  ] = await Promise.all([
    client.student.count(),
    client.payment.count(),
    client.attendance.count(),
    client.grade.count(),
    client.teacherPayroll.count(),
    client.transaction.count(),
    client.group.count(),
    client.teacher.count(),
    client.user.count({ where: { role: 'TEACHER' } }),
    client.user.count({ where: { role: { in: ['ADMIN', 'MANAGER'] } } }),
    client.user.count({ where: { role: { notIn: ['ADMIN', 'MANAGER', 'TEACHER'] } } }),
  ]);

  return {
    student: students,
    payment: payments,
    attendance: attendances,
    grade: grades,
    teacherPayroll: payrolls,
    transaction: transactions,
    group: groups,
    teacher: teachersCount,
    teacherUser: teacherUsers,
    staffUser: staffUsers,
    otherUsers,
  };
}

function printCounts(title, counts) {
  console.log(`\n${title}`);
  for (const [label, key] of countModels) {
    const suffix = key === 'staffUser' ? ' (o\'chirilmaydi)' : '';
    console.log(`  ${label}: ${counts[key]}${suffix}`);
  }
}

async function resetAndSeed() {
  const target = getDatabaseTarget(process.env.DATABASE_URL);
  console.log(`Ulanilayotgan baza: ${target.display}`);
  if (target.isProduction || process.env.NODE_ENV === 'production') {
    console.warn('OGOHLANTIRISH: DATABASE_URL production/Neon bazasiga o\'xshaydi.');
    if (!process.argv.includes('--confirm-production')) {
      throw new Error('Production bazaga ishlatish uchun --confirm-production ham talab qilinadi.');
    }
  }
  if (!target.supported) {
    throw new Error('Reset-and-seed faqat PostgreSQL bazasida ishlaydi.');
  }

  const requestedLogins = teachers.map(({ login }) => login);
  const findConflictingUsers = (client) => client.user.findMany({
    where: {
      login: { in: requestedLogins },
      role: { not: 'TEACHER' },
    },
    select: { login: true, role: true },
  });
  const conflicts = await findConflictingUsers(prisma);
  if (conflicts.length > 0) {
    throw new Error(
      `Quyidagi loginlar o'qituvchi bo'lmagan akkauntlarda band: ${conflicts.map(({ login, role }) => `${login} (${role})`).join(', ')}`,
    );
  }

  const initialCounts = await getCounts(prisma);
  printCounts('Rejalashtirilgan o\'chirishlar (teacher user va staff hisobga olingan):', initialCounts);

  if (!process.argv.includes('--confirm')) {
    console.log('\nDRY-RUN: hech qanday ma\'lumot o\'zgartirilmadi. Haqiqiy rejim uchun --confirm bering.');
    return;
  }

  const credentials = teachers.map((teacher) => ({
    ...teacher,
    password: crypto.randomBytes(24).toString('base64url'),
  }));
  const passwordHashes = await Promise.all(
    credentials.map(({ password }) => bcrypt.hash(password, 10)),
  );

  const result = await prisma.$transaction(async (tx) => {
    const transactionConflicts = await findConflictingUsers(tx);
    if (transactionConflicts.length > 0) {
      throw new Error('Yangi o\'qituvchi loginlaridan biri boshqa rol tomonidan band qilingan.');
    }

    const transactionCounts = await getCounts(tx);
    printCounts('Tranzaksiya boshlanishidagi amaldagi hisoblar:', transactionCounts);

    await tx.attendance.deleteMany();
    await tx.payment.deleteMany();
    await tx.grade.deleteMany();
    await tx.teacherPayroll.deleteMany();
    await tx.transaction.deleteMany();
    await tx.student.deleteMany();
    await tx.group.deleteMany();
    await tx.teacher.deleteMany();
    await tx.user.deleteMany({ where: { role: 'TEACHER' } });

    for (let index = 0; index < credentials.length; index += 1) {
      const teacher = credentials[index];
      const user = await tx.user.create({
        data: {
          fullName: teacher.fullName,
          login: teacher.login,
          passwordHash: passwordHashes[index],
          role: 'TEACHER',
          teacherProfile: {
            create: {
              phone: '',
              subject: teacher.subject,
              salaryMode: null,
              salaryValue: null,
            },
          },
        },
        select: { teacherProfile: { select: { id: true } } },
      });

      await tx.group.create({
        data: {
          name: teacher.groupName,
          teacherId: user.teacherProfile.id,
          schedule: 'Jadval belgilanmagan',
        },
      });
    }

    const finalCounts = await getCounts(tx);
    const teacherGroups = await tx.teacher.findMany({
      select: {
        user: { select: { login: true } },
        groups: { select: { students: { select: { id: true } } } },
      },
    });
    const expected = {
      student: 0,
      payment: 0,
      attendance: 0,
      grade: 0,
      teacherPayroll: 0,
      transaction: 0,
      group: teachers.length,
      teacher: teachers.length,
      teacherUser: teachers.length,
      staffUser: transactionCounts.staffUser,
      otherUsers: transactionCounts.otherUsers,
    };

    for (const [key, value] of Object.entries(expected)) {
      if (finalCounts[key] !== value) {
        throw new Error(`Tekshiruv muvaffaqiyatsiz: ${key}=${finalCounts[key]}, kutilgan=${value}`);
      }
    }
    if (
      teacherGroups.length !== teachers.length ||
      teacherGroups.some(({ user, groups }) =>
        groups.length !== 1 ||
        groups[0].students.length !== 0 ||
        !requestedLogins.includes(user.login)
      )
    ) {
      throw new Error('Har bir o\'qituvchiga aynan bittadan bo\'sh guruh biriktirilmagan.');
    }

    return { finalCounts };
  }, { maxWait: 10000, timeout: 30000 });

  for (const table of [
    'User',
    'Teacher',
    'Student',
    'Group',
    'Attendance',
    'Grade',
    'Transaction',
    'TeacherPayroll',
    'Payment',
  ]) {
    await prisma.$queryRawUnsafe(
      `SELECT setval(pg_get_serial_sequence('"${table}"', 'id'), COALESCE(MAX("id"), 1), MAX("id") IS NOT NULL) FROM "${table}"`,
    );
  }

  printCounts('Yakuniy tekshiruv (tranzaksiya muvaffaqiyatli saqlandi):', result.finalCounts);
  console.log('\nYangi o\'qituvchi loginlari va vaqtinchalik parollar (faqat shu terminalga chiqarildi):');
  for (const teacher of credentials) {
    console.log(`  ${teacher.login}\t${teacher.password}`);
  }
  console.log('\nParollar bazaga bcrypt hash ko\'rinishida saqlandi.');
}

resetAndSeed()
  .catch((error) => {
    console.error('Skript bajarilmadi:', error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
