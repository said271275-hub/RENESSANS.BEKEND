import { Request, Response } from 'express';
import prisma from '../prisma';

export const getManagerOverview = async (req: Request, res: Response) => {
  try {
    const [totalStudents, totalTeachers, totalGroups, transactions] = await Promise.all([
      prisma.student.count(),
      prisma.teacher.count(),
      prisma.group.count(),
      prisma.transaction.findMany(),
    ]);

    const totalIncome = transactions
      .filter(t => t.type === 'INCOME')
      .reduce((sum, t) => sum + t.amount, 0);

    const totalExpense = transactions
      .filter(t => t.type === 'EXPENSE')
      .reduce((sum, t) => sum + t.amount, 0);

    const netProfit = totalIncome - totalExpense;

    return res.json({
      totalStudents,
      totalTeachers,
      totalGroups,
      totalIncome,
      totalExpense,
      netProfit,
    });
  } catch (error: any) {
    return res.status(500).json({ message: 'Statistikani yuklashda xatolik.', error: error.message });
  }
};

// ==================== FINANCE TRANSACTIONS ====================
export const getTransactions = async (req: Request, res: Response) => {
  try {
    const { type, category, startDate, endDate } = req.query;

    const where: any = {};
    if (type) where.type = String(type);
    if (category) where.category = String(category);
    if (startDate || endDate) {
      where.date = {};
      if (startDate) where.date.gte = String(startDate);
      if (endDate) where.date.lte = String(endDate);
    }

    const transactions = await prisma.transaction.findMany({
      where,
      orderBy: { date: 'desc' },
    });

    return res.json(transactions);
  } catch (error: any) {
    return res.status(500).json({ message: 'Moliya ma\'lumotlarini yuklashda xatolik.', error: error.message });
  }
};

export const createTransaction = async (req: Request, res: Response) => {
  try {
    const { type, category, amount, date, note } = req.body;

    if (!type || !category || !amount || !date) {
      return res.status(400).json({ message: 'Barcha majburiy maydonlarni to\'ldiring.' });
    }

    const transaction = await prisma.transaction.create({
      data: {
        type,
        category,
        amount: Number(amount),
        date: String(date),
        note: note || '',
      },
    });

    return res.status(201).json(transaction);
  } catch (error: any) {
    return res.status(500).json({ message: 'Tranzaksiya yaratishda xatolik.', error: error.message });
  }
};

export const updateTransaction = async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    const { type, category, amount, date, note } = req.body;

    const transaction = await prisma.transaction.update({
      where: { id },
      data: {
        type,
        category,
        amount: Number(amount),
        date: String(date),
        note: note || '',
      },
    });

    return res.json(transaction);
  } catch (error: any) {
    return res.status(500).json({ message: 'Tranzaksiyani yangilashda xatolik.', error: error.message });
  }
};

export const deleteTransaction = async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    await prisma.transaction.delete({ where: { id } });
    return res.json({ message: 'Tranzaksiya muvaffaqiyatli o\'chirildi.' });
  } catch (error: any) {
    return res.status(500).json({ message: 'Tranzaksiyani o\'chirishda xatolik.', error: error.message });
  }
};

// Monthly aggregation for Bar/Line chart
export const getMonthlyFinanceChart = async (req: Request, res: Response) => {
  try {
    const transactions = await prisma.transaction.findMany({
      orderBy: { date: 'asc' },
    });

    // Group by month YYYY-MM
    const monthlyMap: { [key: string]: { month: string; income: number; expense: number; profit: number } } = {};

    transactions.forEach(t => {
      const monthKey = t.date.slice(0, 7); // e.g. "2025-05"
      if (!monthlyMap[monthKey]) {
        monthlyMap[monthKey] = {
          month: monthKey,
          income: 0,
          expense: 0,
          profit: 0,
        };
      }
      if (t.type === 'INCOME') {
        monthlyMap[monthKey].income += t.amount;
      } else {
        monthlyMap[monthKey].expense += t.amount;
      }
      monthlyMap[monthKey].profit = monthlyMap[monthKey].income - monthlyMap[monthKey].expense;
    });

    const chartData = Object.values(monthlyMap);
    return res.json(chartData);
  } catch (error: any) {
    return res.status(500).json({ message: 'Grafik ma\'lumotlarini olishda xatolik.', error: error.message });
  }
};

// ==================== STUDENT RATING ====================
export const getStudentRatings = async (req: Request, res: Response) => {
  try {
    const { period, groupId } = req.query; // period: 'weekly' | 'monthly'

    const now = new Date();
    let startDate = new Date();
    if (period === 'weekly') {
      startDate.setDate(now.getDate() - 7);
    } else {
      startDate.setDate(now.getDate() - 30);
    }
    const startDateStr = startDate.toISOString().split('T')[0];

    const where: any = {
      date: { gte: startDateStr },
    };

    if (groupId) {
      where.student = { groupId: Number(groupId) };
    }

    const grades = await prisma.grade.findMany({
      where,
      include: {
        student: {
          include: { group: true }
        }
      }
    });

    // Aggregate by student
    const studentGradesMap: {
      [id: number]: {
        studentId: number;
        fullName: string;
        groupName: string;
        scores: number[];
      }
    } = {};

    grades.forEach(g => {
      if (!studentGradesMap[g.studentId]) {
        studentGradesMap[g.studentId] = {
          studentId: g.studentId,
          fullName: g.student.fullName,
          groupName: g.student.group?.name || 'Guruhsiz',
          scores: [],
        };
      }
      studentGradesMap[g.studentId].scores.push(g.score);
    });

    const rankedStudents = Object.values(studentGradesMap).map(item => {
      const averageScore = Math.round(
        (item.scores.reduce((a, b) => a + b, 0) / item.scores.length) * 10
      ) / 10;
      return {
        studentId: item.studentId,
        fullName: item.fullName,
        groupName: item.groupName,
        totalGradesCount: item.scores.length,
        averageScore,
      };
    });

    // Sort descending by averageScore
    rankedStudents.sort((a, b) => b.averageScore - a.averageScore);

    // Add rank
    const top10 = rankedStudents.slice(0, 10).map((s, index) => ({
      rank: index + 1,
      ...s,
    }));

    return res.json(top10);
  } catch (error: any) {
    return res.status(500).json({ message: 'Reytingni hisoblashda xatolik.', error: error.message });
  }
};
