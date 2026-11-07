import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import prisma from '../prisma';
import { notifyAbsentParents } from '../services/telegramService';

export const getDashboardStats = async (req: Request, res: Response) => {
  try {
    const today = new Date().toISOString().split('T')[0];

    const [studentsCount, teachersCount, groupsCount, todayAttendances] = await Promise.all([
      prisma.student.count(),
      prisma.teacher.count(),
      prisma.group.count(),
      prisma.attendance.findMany({
        where: { date: today },
      }),
    ]);

    const totalToday = todayAttendances.length;
    const presentToday = todayAttendances.filter(a => a.status === 'KELDI').length;
    const attendancePercentage = totalToday > 0 ? Math.round((presentToday / totalToday) * 100) : 0;

    const statusCounts = {
      keldi: todayAttendances.filter(a => a.status === 'KELDI').length,
      kelmadi: todayAttendances.filter(a => a.status === 'KELMADI').length,
      sababli: todayAttendances.filter(a => a.status === 'SABABLI').length,
    };

    // Recent 5 students
    const recentStudents = await prisma.student.findMany({
      take: 5,
      orderBy: { createdAt: 'desc' },
      include: { group: true },
    });

    // Recent 5 attendances
    const recentAttendances = await prisma.attendance.findMany({
      take: 5,
      orderBy: { createdAt: 'desc' },
      include: {
        student: true,
        group: true,
        markedByTeacher: { include: { user: true } },
      },
    });

    return res.json({
      studentsCount,
      teachersCount,
      groupsCount,
      attendancePercentage,
      statusCounts,
      recentStudents,
      recentAttendances,
    });
  } catch (error: any) {
    console.error('getDashboardStats xatosi:', error);
    return res.status(500).json({ message: 'Statistikani yuklashda xatolik yuz berdi.', error: error.message });
  }
};

// ==================== STUDENTS ====================
export const getStudents = async (req: Request, res: Response) => {
  try {
    const { search, groupId } = req.query;

    const where: any = {};
    if (groupId) {
      where.groupId = Number(groupId);
    }
    if (search) {
      const q = String(search).trim();
      where.OR = [
        { fullName: { contains: q } },
        { phone: { contains: q } },
        { parentPhone: { contains: q } },
      ];
    }

    const students = await prisma.student.findMany({
      where,
      include: {
        group: {
          include: {
            teacher: { include: { user: true } }
          }
        }
      },
      orderBy: { fullName: 'asc' },
    });

    return res.json(students);
  } catch (error: any) {
    return res.status(500).json({ message: 'O\'quvchilarni yuklashda xatolik.', error: error.message });
  }
};

export const createStudent = async (req: Request, res: Response) => {
  try {
    const { fullName, phone, parentPhone, birthDate, groupId, monthlyFee } = req.body;

    if (!fullName || !phone || !parentPhone || !birthDate) {
      return res.status(400).json({ message: 'Barcha majburiy maydonlarni to\'ldiring.' });
    }
    if (monthlyFee !== undefined && (!Number.isFinite(Number(monthlyFee)) || Number(monthlyFee) < 0)) {
      return res.status(400).json({ message: 'Oylik kurs narxi manfiy bo\'lmasligi kerak.' });
    }

    const student = await prisma.student.create({
      data: {
        fullName,
        phone,
        parentPhone,
        birthDate,
        monthlyFee: Number(monthlyFee || 0),
        groupId: groupId ? Number(groupId) : null,
      },
      include: { group: true },
    });

    return res.status(201).json(student);
  } catch (error: any) {
    return res.status(500).json({ message: 'O\'quvchi qo\'shishda xatolik.', error: error.message });
  }
};

export const updateStudent = async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    const { fullName, phone, parentPhone, birthDate, groupId, monthlyFee } = req.body;
    if (monthlyFee !== undefined && (!Number.isFinite(Number(monthlyFee)) || Number(monthlyFee) < 0)) {
      return res.status(400).json({ message: 'Oylik kurs narxi manfiy bo\'lmasligi kerak.' });
    }

    const student = await prisma.student.update({
      where: { id },
      data: {
        fullName,
        phone,
        parentPhone,
        birthDate,
        monthlyFee: monthlyFee !== undefined ? Number(monthlyFee) : undefined,
        groupId: groupId ? Number(groupId) : null,
      },
      include: { group: true },
    });

    return res.json(student);
  } catch (error: any) {
    return res.status(500).json({ message: 'O\'quvchini yangilashda xatolik.', error: error.message });
  }
};

export const deleteStudent = async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    await prisma.student.delete({ where: { id } });
    return res.json({ message: 'O\'quvchi muvaffaqiyatli o\'chirildi.' });
  } catch (error: any) {
    return res.status(500).json({ message: 'O\'quvchini o\'chirishda xatolik.', error: error.message });
  }
};

// ==================== TEACHERS ====================
export const getTeachers = async (req: Request, res: Response) => {
  try {
    const teachers = await prisma.teacher.findMany({
      include: {
        user: { select: { id: true, fullName: true, login: true, role: true } },
        groups: true,
      },
      orderBy: { user: { fullName: 'asc' } },
    });

    return res.json(teachers);
  } catch (error: any) {
    return res.status(500).json({ message: 'O\'qituvchilarni yuklashda xatolik.', error: error.message });
  }
};

export const createTeacher = async (req: Request, res: Response) => {
  try {
    const { fullName, phone, subject, login, password } = req.body;

    if (!fullName || !phone || !subject || !login || !password) {
      return res.status(400).json({ message: 'Barcha maydonlarni to\'ldiring.' });
    }

    const cleanLogin = login.trim().toLowerCase();
    const existingUser = await prisma.user.findUnique({ where: { login: cleanLogin } });
    if (existingUser) {
      return res.status(400).json({ message: 'Ushbu login band. Boshqa login tanlang.' });
    }

    const passwordHash = await bcrypt.hash(password.trim(), 10);

    const user = await prisma.user.create({
      data: {
        fullName: fullName.trim(),
        login: cleanLogin,
        passwordHash,
        role: 'TEACHER',
        teacherProfile: {
          create: {
            phone: phone.trim(),
            subject: subject.trim(),
          },
        },
      },
      include: {
        teacherProfile: true,
      },
    });

    return res.status(201).json(user);
  } catch (error: any) {
    return res.status(500).json({ message: 'O\'qituvchi yaratishda xatolik.', error: error.message });
  }
};

export const updateTeacher = async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id); // teacher.id
    const { fullName, phone, subject, login, password } = req.body;

    const teacher = await prisma.teacher.findUnique({
      where: { id },
      include: { user: true },
    });

    if (!teacher) {
      return res.status(404).json({ message: 'O\'qituvchi topilmadi.' });
    }

    const userUpdateData: any = {};
    if (fullName) userUpdateData.fullName = fullName.trim();

    if (login) {
      const cleanLogin = login.trim().toLowerCase();
      // Check if another user already has this login
      const existing = await prisma.user.findFirst({
        where: {
          login: cleanLogin,
          NOT: { id: teacher.userId },
        },
      });
      if (existing) {
        return res.status(400).json({ message: 'Ushbu login boshqa foydalanuvchi tomonidan band qilingan.' });
      }
      userUpdateData.login = cleanLogin;
    }

    if (password && password.trim().length > 0) {
      userUpdateData.passwordHash = await bcrypt.hash(password.trim(), 10);
    }

    if (Object.keys(userUpdateData).length > 0) {
      await prisma.user.update({
        where: { id: teacher.userId },
        data: userUpdateData,
      });
    }

    const updatedTeacher = await prisma.teacher.update({
      where: { id },
      data: {
        phone: phone ? phone.trim() : teacher.phone,
        subject: subject ? subject.trim() : teacher.subject,
      },
      include: {
        user: { select: { id: true, fullName: true, login: true, role: true } },
        groups: true,
      },
    });

    return res.json(updatedTeacher);
  } catch (error: any) {
    return res.status(500).json({ message: 'O\'qituvchini yangilashda xatolik.', error: error.message });
  }
};

export const resetTeacherCredentials = async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id); // teacher.id
    const { login, password } = req.body;

    if (!login || !password) {
      return res.status(400).json({ message: 'Login va yangi parol kiritilishi shart.' });
    }

    const teacher = await prisma.teacher.findUnique({
      where: { id },
      include: { user: true },
    });

    if (!teacher) {
      return res.status(404).json({ message: 'O\'qituvchi topilmadi.' });
    }

    const cleanLogin = login.trim().toLowerCase();
    const existing = await prisma.user.findFirst({
      where: {
        login: cleanLogin,
        NOT: { id: teacher.userId },
      },
    });

    if (existing) {
      return res.status(400).json({ message: 'Ushbu login allaqachon mavjud. Boshqa login tanlang.' });
    }

    const passwordHash = await bcrypt.hash(password.trim(), 10);

    const updatedUser = await prisma.user.update({
      where: { id: teacher.userId },
      data: {
        login: cleanLogin,
        passwordHash,
      },
      select: {
        id: true,
        fullName: true,
        login: true,
        role: true,
      },
    });

    return res.json({
      message: `${updatedUser.fullName} uchun login va parol muvaffaqiyatli saqlandi.`,
      user: updatedUser,
      login: updatedUser.login,
    });
  } catch (error: any) {
    return res.status(500).json({ message: 'Login/parolni o\'zgartirishda xatolik yuz berdi.', error: error.message });
  }
};

export const deleteTeacher = async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    const teacher = await prisma.teacher.findUnique({ where: { id } });
    if (!teacher) {
      return res.status(404).json({ message: 'O\'qituvchi topilmadi.' });
    }

    // Deleting User cascades to Teacher
    await prisma.user.delete({ where: { id: teacher.userId } });

    return res.json({ message: 'O\'qituvchi muvaffaqiyatli o\'chirildi.' });
  } catch (error: any) {
    return res.status(500).json({ message: 'O\'qituvchini o\'chirishda xatolik.', error: error.message });
  }
};

// ==================== GROUPS ====================
export const getGroups = async (req: Request, res: Response) => {
  try {
    const groups = await prisma.group.findMany({
      include: {
        teacher: { include: { user: true } },
        students: true,
      },
      orderBy: { name: 'asc' },
    });

    return res.json(groups);
  } catch (error: any) {
    return res.status(500).json({ message: 'Guruhlarni yuklashda xatolik.', error: error.message });
  }
};

export const createGroup = async (req: Request, res: Response) => {
  try {
    const { name, teacherId, schedule } = req.body;

    if (!name || !schedule) {
      return res.status(400).json({ message: 'Guruh nomi va dars jadvali kiritilishi shart.' });
    }

    const group = await prisma.group.create({
      data: {
        name,
        teacherId: teacherId ? Number(teacherId) : null,
        schedule,
      },
      include: {
        teacher: { include: { user: true } },
        students: true,
      },
    });

    return res.status(201).json(group);
  } catch (error: any) {
    return res.status(500).json({ message: 'Guruh yaratishda xatolik.', error: error.message });
  }
};

export const updateGroup = async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    const { name, teacherId, schedule } = req.body;

    const group = await prisma.group.update({
      where: { id },
      data: {
        name,
        teacherId: teacherId !== undefined ? (teacherId ? Number(teacherId) : null) : undefined,
        schedule,
      },
      include: {
        teacher: { include: { user: true } },
        students: true,
      },
    });

    return res.json(group);
  } catch (error: any) {
    return res.status(500).json({ message: 'Guruhni yangilashda xatolik.', error: error.message });
  }
};

export const deleteGroup = async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    await prisma.group.delete({ where: { id } });
    return res.json({ message: 'Guruh muvaffaqiyatli o\'chirildi.' });
  } catch (error: any) {
    return res.status(500).json({ message: 'Guruhni o\'chirishda xatolik.', error: error.message });
  }
};

// ==================== ATTENDANCE VIEW ====================
export const getAdminAttendances = async (req: Request, res: Response) => {
  try {
    const { groupId, teacherId, startDate, endDate, date } = req.query;

    const where: any = {};
    if (groupId) where.groupId = Number(groupId);
    if (teacherId) where.markedByTeacherId = Number(teacherId);

    if (date) {
      where.date = String(date);
    } else if (startDate || endDate) {
      where.date = {};
      if (startDate) where.date.gte = String(startDate);
      if (endDate) where.date.lte = String(endDate);
    }

    const attendances = await prisma.attendance.findMany({
      where,
      include: {
        student: true,
        group: true,
        markedByTeacher: { include: { user: true } },
        reasonByTeacher: { include: { user: true } },
      },
      orderBy: [{ date: 'desc' }, { student: { fullName: 'asc' } }],
    });

    return res.json(attendances);
  } catch (error: any) {
    return res.status(500).json({ message: 'Davomatni yuklashda xatolik.', error: error.message });
  }
};

export const saveAdminAttendance = async (req: Request, res: Response) => {
  try {
    const { groupId, date, records } = req.body;

    if (!groupId || !date || !Array.isArray(records)) {
      return res.status(400).json({ message: 'Ma\'lumotlar to\'liq emas.' });
    }

    const group = await prisma.group.findUnique({
      where: { id: Number(groupId) },
    });

    if (!group) {
      return res.status(404).json({ message: 'Guruh topilmadi.' });
    }

    const savedRecords = await prisma.$transaction(
      records.map((r: { studentId: number; status: string }) =>
        prisma.attendance.upsert({
          where: {
            studentId_groupId_date: {
              studentId: Number(r.studentId),
              groupId: Number(groupId),
              date: String(date),
            },
          },
          update: {
            status: r.status,
            markedByTeacherId: group.teacherId,
            ...(r.status !== 'SABABLI' && {
              reason: null,
              reasonByTeacherId: null,
              reasonAt: null,
            }),
          },
          create: {
            studentId: Number(r.studentId),
            groupId: Number(groupId),
            date: String(date),
            status: r.status,
            markedByTeacherId: group.teacherId,
          },
        })
      )
    );

    // Kelmagan o'quvchilarning ota-onasiga Telegram xabari
    const absentRecs = (records as Array<{ studentId: number; status: string }>).filter(
      r => r.status === 'KELMADI' || r.status === 'SABABLI'
    );
    if (absentRecs.length > 0) {
      const absentIds = absentRecs.map(r => Number(r.studentId));
      const absentStudents = await prisma.student.findMany({
        where: { id: { in: absentIds }, parentTelegramChatId: { not: null } },
        select: { id: true, fullName: true, parentTelegramChatId: true },
      });
      if (absentStudents.length > 0) {
        const statusMap = new Map(absentRecs.map(r => [Number(r.studentId), r.status]));
        notifyAbsentParents(absentStudents, group.name, String(date), statusMap).catch(console.error);
      }
    }

    return res.json({
      message: 'Davomat muvaffaqiyatli saqlandi.',
      savedRecords,
    });
  } catch (error: any) {
    console.error('saveAdminAttendance xatosi:', error);
    return res.status(500).json({ message: 'Davomatni saqlashda xatolik.', error: error.message });
  }
};

// ==================== PAYMENTS (TO'LOVLAR) ====================
export const getPayments = async (req: Request, res: Response) => {
  try {
    const { search, method, status, month } = req.query;

    const where: any = {};

    if (method && method !== 'Barchasi') {
      where.method = String(method);
    }

    if (status && status !== 'Barchasi') {
      where.status = String(status);
    }

    if (month && month !== 'Barchasi') {
      where.month = String(month);
    }

    if (search) {
      const q = String(search).trim();
      where.OR = [
        { receiptNo: { contains: q } },
        { student: { fullName: { contains: q } } },
        { student: { group: { name: { contains: q } } } },
        { note: { contains: q } },
      ];
    }

    const payments = await prisma.payment.findMany({
      where,
      include: {
        student: {
          include: {
            group: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return res.json(payments);
  } catch (error: any) {
    console.error('getPayments xatosi:', error);
    return res.status(500).json({ message: 'To\'lovlarni yuklashda xatolik.', error: error.message });
  }
};

export const createPayment = async (req: Request, res: Response) => {
  try {
    const { studentId, month, date, amount, method, note, status } = req.body;

    if (!studentId || !amount || !date) {
      return res.status(400).json({ message: 'O\'quvchi, summa va to\'lov sanasi kiritilishi shart.' });
    }

    const student = await prisma.student.findUnique({
      where: { id: Number(studentId) },
      include: { group: true },
    });

    if (!student) {
      return res.status(404).json({ message: 'O\'quvchi topilmadi.' });
    }

    // Generate readable receipt number: e.g. CHK-1001, CHK-1002...
    const count = await prisma.payment.count();
    const receiptNo = `#CHK-${1001 + count}`;

    const payment = await prisma.payment.create({
      data: {
        receiptNo,
        studentId: Number(studentId),
        month: String(month || date.slice(0, 7)),
        date: String(date),
        amount: Number(amount),
        method: method || 'Plastik karta',
        status: status || 'TO\'LANGAN',
        note: note ? String(note) : null,
      },
      include: {
        student: {
          include: {
            group: true,
          },
        },
      },
    });

    // Also record income transaction in finance
    await prisma.transaction.create({
      data: {
        type: 'INCOME',
        category: 'O\'quvchi to\'lovi',
        amount: Number(amount),
        date: String(date),
        note: `${receiptNo} - ${student.fullName} (${student.group?.name || 'Guruhsiz'}). ${note || ''}`,
      },
    });

    return res.status(201).json({
      message: 'To\'lov muvaffaqiyatli qabul qilindi.',
      payment,
    });
  } catch (error: any) {
    console.error('createPayment xatosi:', error);
    return res.status(500).json({ message: 'To\'lovni qabul qilishda xatolik.', error: error.message });
  }
};

export const deletePayment = async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    await prisma.payment.delete({ where: { id } });
    return res.json({ message: 'To\'lov muvaffaqiyatli o\'chirildi.' });
  } catch (error: any) {
    return res.status(500).json({ message: 'To\'lovni o\'chirishda xatolik.', error: error.message });
  }
};
