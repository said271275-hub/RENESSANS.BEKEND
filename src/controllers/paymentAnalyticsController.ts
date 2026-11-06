import { Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import prisma from '../prisma';
import { AuthenticatedRequest } from '../types';

type SalaryMode = 'PERCENT' | 'FIXED';

const isValidMonth = (month: unknown): month is string =>
  typeof month === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(month);

const roundMoney = (amount: number) => Math.round(amount);

const getStudentPaymentStatus = (monthlyFee: number, paidAmount: number) => {
  if (monthlyFee <= 0) return 'UNCONFIGURED';
  if (paidAmount >= monthlyFee) return 'PAID';
  return paidAmount > 0 ? 'PARTIAL' : 'UNPAID';
};

const summarizeStudents = (students: Array<{
  monthlyFee: number;
  payments: Array<{ amount: number; date?: string }>;
}>) => {
  let paidCount = 0;
  let partialCount = 0;
  let unpaidCount = 0;
  let unconfiguredCount = 0;
  let collectedAmount = 0;
  let expectedAmount = 0;

  const studentRows = students.map((student) => {
    const monthlyFee = roundMoney(student.monthlyFee);
    const paidAmount = roundMoney(student.payments.reduce((sum, payment) => sum + payment.amount, 0));
    const status = getStudentPaymentStatus(monthlyFee, paidAmount);
    const balance = Math.max(monthlyFee - paidAmount, 0);

    collectedAmount += paidAmount;
    expectedAmount += monthlyFee;
    if (status === 'PAID') paidCount++;
    else if (status === 'PARTIAL') partialCount++;
    else if (status === 'UNPAID') unpaidCount++;
    else unconfiguredCount++;

    return {
      monthlyFee,
      paidAmount,
      balance,
      status,
      paymentPercentage: monthlyFee > 0 ? Math.min(roundMoney((paidAmount / monthlyFee) * 100), 100) : 0,
      lastPaymentDate: student.payments[0]?.date || null,
    };
  });

  collectedAmount = roundMoney(collectedAmount);
  expectedAmount = roundMoney(expectedAmount);

  return {
    paidCount,
    partialCount,
    unpaidCount,
    unconfiguredCount,
    collectedAmount,
    expectedAmount,
    paymentPercentage: expectedAmount > 0 ? roundMoney((collectedAmount / expectedAmount) * 100) : 0,
    students: studentRows,
  };
};

const getGroupPaymentData = async (groupId: number, month: string) => {
  return prisma.group.findUnique({
    where: { id: groupId },
    include: {
      teacher: { include: { user: { select: { fullName: true } } } },
      students: {
        orderBy: { fullName: 'asc' },
        include: {
          payments: {
            where: { month, status: "TO'LANGAN" },
            orderBy: { date: 'desc' },
            select: { amount: true, date: true },
          },
        },
      },
      payrolls: {
        where: { month },
        include: { transaction: true },
      },
    },
  });
};

const getSalaryInputs = (
  teacher: { salaryMode: string | null; salaryValue: number | null },
  requestedMode: unknown,
  requestedValue: unknown
) => {
  const mode = requestedMode ?? teacher.salaryMode;
  const value = requestedValue === undefined ? teacher.salaryValue : Number(requestedValue);
  if (mode !== 'PERCENT' && mode !== 'FIXED') {
    return { error: 'Maosh turini tanlang.' } as const;
  }
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || (mode === 'PERCENT' && value > 100)) {
    return { error: mode === 'PERCENT' ? 'Foiz 0 dan 100 gacha bo\'lishi kerak.' : 'Oylik manfiy bo\'lmasligi kerak.' } as const;
  }
  return { mode: mode as SalaryMode, value } as const;
};

const calculateSalary = (
  mode: SalaryMode,
  value: number,
  collectedAmount: number,
  expectedAmount: number
) => {
  const paymentRate = expectedAmount > 0 ? Math.min(collectedAmount / expectedAmount, 1) : 0;
  const amount = mode === 'PERCENT'
    ? collectedAmount * value / 100
    : value * paymentRate;
  return { paymentRate, amount: roundMoney(amount) };
};

const validateMonthRequest = (req: Request, res: Response) => {
  const month = req.query.month;
  if (!isValidMonth(month)) {
    res.status(400).json({ message: 'Oy YYYY-MM formatida bo\'lishi kerak.' });
    return null;
  }
  return month;
};

export const getGroupPaymentSummaries = async (req: Request, res: Response) => {
  try {
    const month = validateMonthRequest(req, res);
    if (!month) return;

    const groups = await prisma.group.findMany({
      orderBy: { name: 'asc' },
      include: {
        teacher: { include: { user: { select: { fullName: true } } } },
        students: {
          include: {
            payments: {
              where: { month, status: "TO'LANGAN" },
              select: { amount: true },
            },
          },
        },
        payrolls: {
          where: { month },
          select: { id: true, amount: true },
        },
      },
    });

    return res.json(groups.map((group) => {
      const summary = summarizeStudents(group.students);
      return {
        id: group.id,
        name: group.name,
        teacher: group.teacher ? {
          id: group.teacher.id,
          fullName: group.teacher.user.fullName,
          salaryMode: group.teacher.salaryMode,
          salaryValue: group.teacher.salaryValue,
        } : null,
        studentCount: group.students.length,
        ...summary,
        students: undefined,
        payroll: group.payrolls[0] || null,
      };
    }));
  } catch (error: any) {
    console.error('getGroupPaymentSummaries xatosi:', error);
    return res.status(500).json({ message: 'Guruhlar to\'lov xulosasini yuklashda xatolik.', error: error.message });
  }
};

export const getGroupPaymentDetails = async (req: Request, res: Response) => {
  try {
    const month = validateMonthRequest(req, res);
    if (!month) return;

    const group = await getGroupPaymentData(Number(req.params.groupId), month);
    if (!group) return res.status(404).json({ message: 'Guruh topilmadi.' });

    const summary = summarizeStudents(group.students);
    const students = group.students.map((student, index) => ({
      id: student.id,
      fullName: student.fullName,
      phone: student.phone,
      ...summary.students[index],
    }));

    return res.json({
      group: {
        id: group.id,
        name: group.name,
        teacher: group.teacher ? {
          id: group.teacher.id,
          fullName: group.teacher.user.fullName,
          salaryMode: group.teacher.salaryMode,
          salaryValue: group.teacher.salaryValue,
        } : null,
      },
      month,
      summary: { ...summary, students: undefined },
      students,
      payroll: group.payrolls[0] || null,
    });
  } catch (error: any) {
    console.error('getGroupPaymentDetails xatosi:', error);
    return res.status(500).json({ message: 'Guruh to\'lov tafsilotlarini yuklashda xatolik.', error: error.message });
  }
};

export const calculateGroupPayroll = async (req: Request, res: Response) => {
  try {
    const month = req.body.month;
    if (!isValidMonth(month)) {
      return res.status(400).json({ message: 'Oy YYYY-MM formatida bo\'lishi kerak.' });
    }

    const group = await getGroupPaymentData(Number(req.params.groupId), month);
    if (!group) return res.status(404).json({ message: 'Guruh topilmadi.' });
    if (!group.teacher) return res.status(400).json({ message: 'Guruhga o\'qituvchi biriktirilmagan.' });

    const approvedPayroll = group.payrolls[0];
    const salary = approvedPayroll
      ? { mode: approvedPayroll.salaryMode as SalaryMode, value: approvedPayroll.salaryValue }
      : getSalaryInputs(group.teacher, req.body.salaryMode, req.body.salaryValue);
    if ('error' in salary) return res.status(400).json({ message: salary.error });

    const summary = summarizeStudents(group.students);
    const calculation = calculateSalary(salary.mode, salary.value, summary.collectedAmount, summary.expectedAmount);

    return res.json({
      teacher: group.teacher.user.fullName,
      group: group.name,
      month,
      salaryMode: salary.mode,
      salaryValue: salary.value,
      ...summary,
      students: undefined,
      salaryAmount: calculation.amount,
      payroll: group.payrolls[0] || null,
      confirmed: group.payrolls.length > 0,
      formula: salary.mode === 'PERCENT'
        ? `${summary.collectedAmount} × ${salary.value}%`
        : `${salary.value} × ${roundMoney(calculation.paymentRate * 100)}%`,
    });
  } catch (error: any) {
    console.error('calculateGroupPayroll xatosi:', error);
    return res.status(500).json({ message: 'O\'qituvchi maoshini hisoblashda xatolik.', error: error.message });
  }
};

export const updateTeacherSalarySettings = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const teacherId = Number(req.params.teacherId);
    const teacher = await prisma.teacher.findUnique({ where: { id: teacherId } });
    if (!teacher) return res.status(404).json({ message: 'O\'qituvchi topilmadi.' });

    const salary = getSalaryInputs(teacher, req.body.salaryMode, req.body.salaryValue);
    if ('error' in salary) return res.status(400).json({ message: salary.error });

    const updated = await prisma.teacher.update({
      where: { id: teacherId },
      data: { salaryMode: salary.mode, salaryValue: salary.value },
    });

    return res.json({ salaryMode: updated.salaryMode, salaryValue: updated.salaryValue });
  } catch (error: any) {
    console.error('updateTeacherSalarySettings xatosi:', error);
    return res.status(500).json({ message: 'O\'qituvchi maosh sozlamasini saqlashda xatolik.', error: error.message });
  }
};

export const confirmGroupPayroll = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const groupId = Number(req.params.groupId);
    const month = req.body.month;
    if (!isValidMonth(month)) {
      return res.status(400).json({ message: 'Oy YYYY-MM formatida bo\'lishi kerak.' });
    }

    const payroll = await prisma.$transaction(async (transaction) => {
      const existing = await transaction.teacherPayroll.findUnique({
        where: { groupId_month: { groupId, month } },
        include: { transaction: true },
      });
      if (existing) return { existing };

      const group = await transaction.group.findUnique({
        where: { id: groupId },
        include: {
          teacher: { include: { user: { select: { fullName: true } } } },
          students: {
            include: {
              payments: {
                where: { month, status: "TO'LANGAN" },
                select: { amount: true },
              },
            },
          },
        },
      });
      if (!group) throw Object.assign(new Error('Guruh topilmadi.'), { status: 404 });
      if (!group.teacher) throw Object.assign(new Error('Guruhga o\'qituvchi biriktirilmagan.'), { status: 400 });

      const salary = getSalaryInputs(group.teacher, req.body.salaryMode, req.body.salaryValue);
      if ('error' in salary) throw Object.assign(new Error(salary.error), { status: 400 });

      const summary = summarizeStudents(group.students);
      const calculation = calculateSalary(salary.mode, salary.value, summary.collectedAmount, summary.expectedAmount);
      const date = `${month}-01`;
      const financeEntry = await transaction.transaction.create({
        data: {
          type: 'EXPENSE',
          category: 'O\'qituvchi maoshi',
          amount: calculation.amount,
          date,
          note: `${group.teacher.user.fullName} - ${group.name} - ${month} oyligi`,
        },
      });

      if (group.teacher.salaryMode !== salary.mode || group.teacher.salaryValue !== salary.value) {
        await transaction.teacher.update({
          where: { id: group.teacher.id },
          data: { salaryMode: salary.mode, salaryValue: salary.value },
        });
      }

      return {
        record: await transaction.teacherPayroll.create({
          data: {
            groupId,
            teacherId: group.teacher.id,
            month,
            salaryMode: salary.mode,
            salaryValue: salary.value,
            paymentPercentage: roundMoney(calculation.paymentRate * 100),
            collectedAmount: summary.collectedAmount,
            expectedAmount: summary.expectedAmount,
            amount: calculation.amount,
            transactionId: financeEntry.id,
          },
          include: { transaction: true },
        }),
      };
    });

    if ('existing' in payroll) {
      return res.status(409).json({ message: 'Ushbu guruh uchun bu oy maosh allaqachon tasdiqlangan.', payroll: payroll.existing });
    }
    return res.status(201).json({ message: 'O\'qituvchi maoshi tasdiqlandi.', payroll: payroll.record });
  } catch (error: any) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return res.status(409).json({ message: 'Ushbu guruh uchun bu oy maosh allaqachon tasdiqlangan.' });
    }
    const status = error.status || 500;
    if (status === 500) console.error('confirmGroupPayroll xatosi:', error);
    return res.status(status).json({ message: status === 500 ? 'Maoshni tasdiqlashda xatolik.' : error.message, ...(status === 500 ? { error: error.message } : {}) });
  }
};
