const path = require('node:path');
const bcrypt = require('bcryptjs');
const dotenv = require('dotenv');

dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient({ log: ['error'] });

async function main() {
  const login = 'admin';
  const password = 'admin123';
  const passwordHash = await bcrypt.hash(password, 10);

  const existing = await prisma.user.findUnique({ where: { login } });

  if (existing) {
    // Mavjud bo'lsa parolini yangilaydi
    await prisma.user.update({
      where: { login },
      data: { passwordHash, role: 'ADMIN' },
    });
    console.log(`✅ "${login}" foydalanuvchisi yangilandi. Parol: ${password}`);
  } else {
    // Yo'q bo'lsa yangidan yaratadi
    await prisma.user.create({
      data: {
        fullName: 'Admin',
        login,
        passwordHash,
        role: 'ADMIN',
      },
    });
    console.log(`✅ "${login}" admin foydalanuvchisi yaratildi. Parol: ${password}`);
  }
}

main()
  .catch((err) => {
    console.error('❌ Xatolik:', err.message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

