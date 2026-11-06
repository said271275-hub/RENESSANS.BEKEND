import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import prisma from '../prisma';
import { AuthenticatedRequest } from '../types';
import { config } from '../config';

const JWT_SECRET = config.jwtSecret;

export const login = async (req: Request, res: Response) => {
  try {
    const { login: userLogin, password } = req.body;

    if (!userLogin || !password) {
      return res.status(400).json({ message: 'Login va parol kiritilishi shart.' });
    }

    const cleanLogin = userLogin.trim().toLowerCase();

    // Flexible user lookup: supports "erali", "erali_ielts", "teacher", etc.
    let user = await prisma.user.findFirst({
      where: {
        OR: [
          { login: cleanLogin },
          { login: `${cleanLogin}_ielts` },
          { login: `${cleanLogin}_cefr` },
          { login: `${cleanLogin}_math` },
          { login: `${cleanLogin}_eng` },
          { login: `${cleanLogin}_rus` },
          { login: `${cleanLogin}_kor` },
          { login: `${cleanLogin}_onatili` },
        ],
      },
      include: { teacherProfile: true },
    });

    // If typed "teacher" or "ustoz", fallback to first teacher (Berdiqulov Erali)
    if (!user && (cleanLogin === 'teacher' || cleanLogin === 'ustoz' || cleanLogin === 'oqituvchi')) {
      user = await prisma.user.findFirst({
        where: { role: 'TEACHER' },
        include: { teacherProfile: true },
      });
    }

    if (!user) {
      return res.status(400).json({ message: 'Login yoki parol noto\'g\'ri.' });
    }

    if (!(await bcrypt.compare(password, user.passwordHash))) {
      return res.status(400).json({ message: 'Login yoki parol noto\'g\'ri.' });
    }

    const payload = {
      userId: user.id,
      fullName: user.fullName,
      login: user.login,
      role: user.role,
      teacherId: user.teacherProfile?.id,
    };

    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });

    return res.json({
      message: 'Muvaffaqiyatli tizimga kirildi.',
      token,
      user: {
        id: user.id,
        fullName: user.fullName,
        login: user.login,
        role: user.role,
        teacherId: user.teacherProfile?.id,
        subject: user.teacherProfile?.subject,
      },
    });
  } catch (error: any) {
    console.error('Login xatosi:', error);
    return res.status(500).json({ message: 'Serverda xatolik yuz berdi.', error: error.message });
  }
};

export const updateOwnCredentials = async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user || !['ADMIN', 'MANAGER'].includes(req.user.role)) {
      return res.status(403).json({ message: 'Hisob ma\'lumotlarini faqat admin va menejer o\'zgartira oladi.' });
    }

    const { currentPassword, newLogin, newPassword } = req.body;
    if (typeof currentPassword !== 'string' || !currentPassword) {
      return res.status(400).json({ message: 'Amaldagi parolni kiriting.' });
    }

    const hasLogin = typeof newLogin === 'string' && newLogin.trim().length > 0;
    const hasPassword = typeof newPassword === 'string' && newPassword.trim().length > 0;
    if (!hasLogin && !hasPassword) {
      return res.status(400).json({ message: 'Yangi login yoki yangi parol kiriting.' });
    }

    const user = await prisma.user.findUnique({ where: { id: req.user.userId } });
    if (!user || !(await bcrypt.compare(currentPassword, user.passwordHash))) {
      return res.status(400).json({ message: 'Amaldagi parol noto\'g\'ri.' });
    }

    const cleanLogin = hasLogin ? newLogin.trim().toLowerCase() : undefined;
    if (cleanLogin && cleanLogin !== user.login) {
      const existingUser = await prisma.user.findUnique({ where: { login: cleanLogin } });
      if (existingUser) {
        return res.status(409).json({ message: 'Ushbu login band. Boshqa login tanlang.' });
      }
    }

    const updatedUser = await prisma.user.update({
      where: { id: user.id },
      data: {
        ...(cleanLogin ? { login: cleanLogin } : {}),
        ...(hasPassword ? { passwordHash: await bcrypt.hash(newPassword.trim(), 10) } : {}),
      },
      select: {
        id: true,
        fullName: true,
        login: true,
        role: true,
      },
    });

    return res.json({ message: 'Hisob ma\'lumotlari muvaffaqiyatli o\'zgartirildi.', user: updatedUser });
  } catch (error: any) {
    if (error.code === 'P2002') {
      return res.status(409).json({ message: 'Ushbu login band. Boshqa login tanlang.' });
    }
    console.error('Hisob ma\'lumotlarini o\'zgartirishda xatolik:', error);
    return res.status(500).json({ message: 'Hisob ma\'lumotlarini o\'zgartirishda server xatoligi.' });
  }
};

export const getMe = async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Avtorizatsiyadan o\'tilmagan.' });
    }

    const user = await prisma.user.findUnique({
      where: { id: req.user.userId },
      include: { teacherProfile: true },
    });

    if (!user) {
      return res.status(404).json({ message: 'Foydalanuvchi topilmadi.' });
    }

    return res.json({
      id: user.id,
      fullName: user.fullName,
      login: user.login,
      role: user.role,
      teacherId: user.teacherProfile?.id,
      subject: user.teacherProfile?.subject,
    });
  } catch (error: any) {
    return res.status(500).json({ message: 'Serverda xatolik yuz berdi.', error: error.message });
  }
};
