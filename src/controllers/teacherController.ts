import { Response } from 'express';
import prisma from '../prisma';
import { AuthenticatedRequest } from '../types';
import { notifyAbsentParents } from '../services/telegramService';

export const getTeacherProfileAndStats = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    const teacher = await prisma.teacher.findUnique({
      where: { userId },
      include: {
        user: true,
        groups: {
          include: {
            students: true,
          },
        },
      },
    });

    if (!teacher) {
      return res.status(404).json({ message: 'O\'qituvchi profili topilmadi.' });
    }

    const groupIds = teacher.groups.map(g => g.id);
    const totalStudents = teacher.groups.reduce((acc, g) => acc + g.students.length, 0);

    // Calculate average attendance for this teacher's groups
    const attendances = await prisma.attendance.findMany({
      where: { groupId: { in: groupIds } },
    });

    const totalAttendanceCount = attendances.length;
    const presentAttendanceCount = attendances.filter(
      a => a.status === 'KELDI'
    ).length;

    const averageAttendance = totalAttendanceCount > 0
      ? Math.round((presentAttendanceCount / totalAttendanceCount) * 100)
      : 0;

    // Calculate average grade
    const grades = await prisma.grade.findMany({
      where: { teacherId: teacher.id },
    });

    const averageGrade = grades.length > 0
      ? Math.round((grades.reduce((sum, g) => sum + g.score, 0) / grades.length) * 10) / 10
      : 0;

    return res.json({
      teacher,
      stats: {
        totalGroups: teacher.groups.length,
        totalStudents,
        averageAttendance,
        averageGrade,
        totalGradesGiven: grades.length,
      },
    });
  } catch (error: any) {
    return res.status(500).json({ message: 'O\'qituvchi statistikasini yuklashda xatolik.', error: error.message });
  }
};

// Get only assigned groups for this teacher
export const getMyGroups = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    const teacher = await prisma.teacher.findUnique({ where: { userId } });

    if (!teacher) {
      return res.status(404).json({ message: 'O\'qituvchi topilmadi.' });
    }

    const groups = await prisma.group.findMany({
      where: { teacherId: teacher.id },
      include: {
        students: {
          orderBy: { fullName: 'asc' },
        },
      },
      orderBy: { name: 'asc' },
    });

    return res.json(groups);
  } catch (error: any) {
    return res.status(500).json({ message: 'Guruhlarni yuklashda xatolik.', error: error.message });
  }
};

// Create a new group by teacher
export const createTeacherGroup = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    const teacher = await prisma.teacher.findUnique({ where: { userId } });

    if (!teacher) {
      return res.status(404).json({ message: 'O\'qituvchi topilmadi.' });
    }

    const { name, schedule } = req.body;
    if (!name || !schedule) {
      return res.status(400).json({ message: 'Guruh nomi va dars jadvali kiritilishi shart.' });
    }

    const group = await prisma.group.create({
      data: {
        name: name.trim(),
        schedule: schedule.trim(),
        teacherId: teacher.id,
      },
      include: {
        students: true,
      },
    });

    return res.status(201).json(group);
  } catch (error: any) {
    return res.status(500).json({ message: 'Guruh yaratishda xatolik.', error: error.message });
  }
};

// Delete a group by teacher
export const deleteTeacherGroup = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    const teacher = await prisma.teacher.findUnique({ where: { userId } });

    if (!teacher) {
      return res.status(404).json({ message: 'O\'qituvchi topilmadi.' });
    }

    const groupId = Number(req.params.groupId);

    const group = await prisma.group.findFirst({
      where: { id: groupId, teacherId: teacher.id },
    });

    if (!group) {
      return res.status(404).json({ message: 'Guruh topilmadi yoki sizga biriktirilmagan.' });
    }

    // Set students' groupId to null before deletion (onDelete: SetNull in schema)
    await prisma.group.delete({
      where: { id: groupId },
    });

    return res.json({ message: 'Guruh muvaffaqiyatli o\'chirildi.' });
  } catch (error: any) {
    console.error('deleteTeacherGroup xatosi:', error);
    return res.status(500).json({ message: 'Guruhni o\'chirishda xatolik.', error: error.message });
  }
};

// Get group students evaluation ranking data (Image 4 format)
export const getGroupStudentsEvaluation = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    const teacher = await prisma.teacher.findUnique({ where: { userId } });

    if (!teacher) {
      return res.status(404).json({ message: 'O\'qituvchi topilmadi.' });
    }

    const groupId = Number(req.params.groupId);
    const date = (req.query.date as string) || new Date().toISOString().split('T')[0];

    const group = await prisma.group.findFirst({
      where: { id: groupId, teacherId: teacher.id },
      include: {
        students: {
          include: {
            grades: {
              where: { teacherId: teacher.id },
            },
            attendances: {
              where: { groupId },
            },
          },
        },
      },
    });

    if (!group) {
      return res.status(404).json({ message: 'Guruh topilmadi yoki sizga biriktirilmagan.' });
    }

    const totalGroupLessons = 43;

    const evaluatedStudents = group.students.map((student) => {
      // Total score across all lessons
      const totalScore = student.grades.reduce((sum, g) => sum + g.score, 0);

      // Breakdown: Green (>= 20), Blue (10), Red (0)
      const greenCount = student.grades.filter((g) => g.score >= 20).length;
      const blueCount = student.grades.filter((g) => g.score === 10).length;
      const redCount = student.grades.filter((g) => g.score === 0).length;

      // Completed lessons
      const completedCount = student.attendances.filter(
        (a) => a.status === 'KELDI'
      ).length;

      // Current grade on the selected date
      const todayGrade = student.grades.find((g) => g.date === date);
      const currentScore = todayGrade !== undefined ? todayGrade.score : null;

      const studentCode = `STUDENT${9000 + student.id}`;

      return {
        id: student.id,
        fullName: student.fullName,
        phone: student.phone,
        parentPhone: student.parentPhone,
        birthDate: student.birthDate,
        studentCode,
        totalScore,
        completedRatio: `${completedCount}/${totalGroupLessons}`,
        completedCount,
        pendingCount: completedCount < 30 ? 1 : 0,
        greenCount,
        blueCount,
        redCount,
        currentScore,
      };
    });

    // Sort descending by totalScore
    evaluatedStudents.sort((a, b) => b.totalScore - a.totalScore);

    // Assign rank 1, 2, 3...
    const rankedStudents = evaluatedStudents.map((s, index) => ({
      rank: index + 1,
      ...s,
    }));

    return res.json({
      group: {
        id: group.id,
        name: group.name,
        schedule: group.schedule,
        totalStudents: group.students.length,
      },
      date,
      students: rankedStudents,
    });
  } catch (error: any) {
    console.error('getGroupStudentsEvaluation xatosi:', error);
    return res.status(500).json({ message: 'Guruh baholash ma\'lumotlarini yuklashda xatolik.', error: error.message });
  }
};

// Save single student evaluation (20, 10, or 0)
export const saveStudentEvaluation = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    const teacher = await prisma.teacher.findUnique({ where: { userId } });

    if (!teacher) {
      return res.status(404).json({ message: 'O\'qituvchi topilmadi.' });
    }

    const groupId = Number(req.params.groupId);
    const { studentId, score, date } = req.body;

    if (!studentId || score === undefined || !date) {
      return res.status(400).json({ message: 'studentId, score va date kiritilishi shart.' });
    }

    const numScore = Number(score);
    const comment =
      numScore === 20
        ? 'Yaxshi qatnashdi (20 ball)'
        : numScore === 10
        ? 'O\'rtacha qatnashdi (10 ball)'
        : 'Umuman yaxshi qatnashmadi (0 ball)';

    // 1. Find or create Grade
    const existingGrade = await prisma.grade.findFirst({
      where: {
        studentId: Number(studentId),
        teacherId: teacher.id,
        date: String(date),
      },
    });

    let savedGrade;
    if (existingGrade) {
      savedGrade = await prisma.grade.update({
        where: { id: existingGrade.id },
        data: {
          score: numScore,
          comment,
        },
      });
    } else {
      savedGrade = await prisma.grade.create({
        data: {
          studentId: Number(studentId),
          teacherId: teacher.id,
          score: numScore,
          comment,
          date: String(date),
        },
      });
    }

    // 2. Synchronize attendance record
    const attendanceStatus = numScore > 0 ? 'KELDI' : 'KELMADI';

    await prisma.attendance.upsert({
      where: {
        studentId_groupId_date: {
          studentId: Number(studentId),
          groupId,
          date: String(date),
        },
      },
      update: {
        status: attendanceStatus,
        markedByTeacherId: teacher.id,
      },
      create: {
        studentId: Number(studentId),
        groupId,
        date: String(date),
        status: attendanceStatus,
        markedByTeacherId: teacher.id,
      },
    });

    return res.json({
      message: 'Baho muvaffaqiyatli saqlandi',
      grade: savedGrade,
    });
  } catch (error: any) {
    console.error('saveStudentEvaluation xatosi:', error);
    return res.status(500).json({ message: 'Bahoni saqlashda xatolik.', error: error.message });
  }
};

// Batch evaluate all students in group
export const batchSaveGroupEvaluation = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    const teacher = await prisma.teacher.findUnique({ where: { userId } });

    if (!teacher) {
      return res.status(404).json({ message: 'O\'qituvchi topilmadi.' });
    }

    const groupId = Number(req.params.groupId);
    const { date, score } = req.body;

    const group = await prisma.group.findFirst({
      where: { id: groupId, teacherId: teacher.id },
      include: { students: true },
    });

    if (!group) {
      return res.status(404).json({ message: 'Guruh topilmadi.' });
    }

    const numScore = Number(score);
    const comment =
      numScore === 20
        ? 'Yaxshi qatnashdi (20 ball)'
        : numScore === 10
        ? 'O\'rtacha qatnashdi (10 ball)'
        : 'Umuman yaxshi qatnashmadi (0 ball)';

    const attendanceStatus = numScore > 0 ? 'KELDI' : 'KELMADI';

    for (const student of group.students) {
      const existingGrade = await prisma.grade.findFirst({
        where: {
          studentId: student.id,
          teacherId: teacher.id,
          date: String(date),
        },
      });

      if (existingGrade) {
        await prisma.grade.update({
          where: { id: existingGrade.id },
          data: { score: numScore, comment },
        });
      } else {
        await prisma.grade.create({
          data: {
            studentId: student.id,
            teacherId: teacher.id,
            score: numScore,
            comment,
            date: String(date),
          },
        });
      }

      await prisma.attendance.upsert({
        where: {
          studentId_groupId_date: {
            studentId: student.id,
            groupId,
            date: String(date),
          },
        },
        update: {
          status: attendanceStatus,
          markedByTeacherId: teacher.id,
        },
        create: {
          studentId: student.id,
          groupId,
          date: String(date),
          status: attendanceStatus,
          markedByTeacherId: teacher.id,
        },
      });
    }

    return res.json({ message: 'Barcha o\'quvchilar muvaffaqiyatli baholandi.' });
  } catch (error: any) {
    console.error('batchSaveGroupEvaluation xatosi:', error);
    return res.status(500).json({ message: 'Guruhni baholashda xatolik.', error: error.message });
  }
};

// Get attendance for a specific group and date
export const getGroupAttendanceByDate = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { groupId, date } = req.query;

    if (!groupId || !date) {
      return res.status(400).json({ message: 'groupId va date parametrlarini ko\'rsating.' });
    }

    const attendances = await prisma.attendance.findMany({
      where: {
        groupId: Number(groupId),
        date: String(date),
      },
      include: {
        student: true,
        reasonByTeacher: { include: { user: true } },
      },
    });

    return res.json(attendances);
  } catch (error: any) {
    return res.status(500).json({ message: 'Davomatni yuklashda xatolik.', error: error.message });
  }
};

export const saveAttendanceReason = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    const teacher = await prisma.teacher.findUnique({ where: { userId } });

    if (!teacher) {
      return res.status(404).json({ message: 'O\'qituvchi topilmadi.' });
    }

    const { groupId, studentId, date, reason } = req.body;
    const parsedGroupId = Number(groupId);
    const parsedStudentId = Number(studentId);

    if (
      !Number.isInteger(parsedGroupId) ||
      parsedGroupId <= 0 ||
      !Number.isInteger(parsedStudentId) ||
      parsedStudentId <= 0 ||
      typeof date !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
      typeof reason !== 'string'
    ) {
      return res.status(400).json({ message: 'Davomat ma\'lumotlari noto\'g\'ri.' });
    }

    const cleanReason = reason.trim();
    if (!cleanReason) {
      return res.status(400).json({ message: 'Sabab matnini kiriting.' });
    }
    if (cleanReason.length > 300) {
      return res.status(400).json({ message: 'Sabab 300 belgidan oshmasligi kerak.' });
    }

    const group = await prisma.group.findFirst({
      where: { id: parsedGroupId, teacherId: teacher.id },
    });
    if (!group) {
      return res.status(403).json({ message: 'Ushbu guruh sizga biriktirilmagan.' });
    }

    const student = await prisma.student.findFirst({
      where: { id: parsedStudentId, groupId: group.id },
    });
    if (!student) {
      return res.status(403).json({ message: 'O\'quvchi ushbu guruhga biriktirilmagan.' });
    }

    const attendance = await prisma.attendance.upsert({
      where: {
        studentId_groupId_date: {
          studentId: student.id,
          groupId: group.id,
          date,
        },
      },
      update: {
        status: 'SABABLI',
        reason: cleanReason,
        reasonByTeacherId: teacher.id,
        reasonAt: new Date(),
        markedByTeacherId: teacher.id,
      },
      create: {
        studentId: student.id,
        groupId: group.id,
        date,
        status: 'SABABLI',
        reason: cleanReason,
        reasonByTeacherId: teacher.id,
        reasonAt: new Date(),
        markedByTeacherId: teacher.id,
      },
      include: {
        student: true,
        reasonByTeacher: { include: { user: true } },
      },
    });

    return res.json(attendance);
  } catch (error: any) {
    console.error('saveAttendanceReason xatosi:', error);
    return res.status(500).json({ message: 'Sababni saqlashda xatolik.', error: error.message });
  }
};

// Save attendance for multiple students in a group on a date
export const saveGroupAttendance = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    const teacher = await prisma.teacher.findUnique({ where: { userId } });

    if (!teacher) {
      return res.status(404).json({ message: 'O\'qituvchi topilmadi.' });
    }

    const { groupId, date, records } = req.body;

    if (!groupId || !date || !Array.isArray(records)) {
      return res.status(400).json({ message: 'Ma\'lumotlar to\'liq emas.' });
    }

    const group = await prisma.group.findFirst({
      where: { id: Number(groupId), teacherId: teacher.id },
    });

    if (!group) {
      return res.status(403).json({ message: 'Ushbu guruh sizga biriktirilmagan.' });
    }

    const validStatuses = ['KELDI', 'KELMADI', 'SABABLI'];
    if (records.some((record: { status?: string }) => !validStatuses.includes(record.status || ''))) {
      return res.status(400).json({ message: 'Davomat holati noto\'g\'ri.' });
    }

    const reasonRecords = await prisma.attendance.findMany({
      where: {
        groupId: Number(groupId),
        date: String(date),
        studentId: { in: records.map((record: { studentId: number }) => Number(record.studentId)) },
      },
      select: { studentId: true, reason: true },
    });
    const reasonsByStudent = new Map(reasonRecords.map((record) => [record.studentId, record.reason]));
    if (records.some((record: { studentId: number; status: string }) =>
      record.status === 'SABABLI' && !reasonsByStudent.get(Number(record.studentId))
    )) {
      return res.status(400).json({ message: 'Sababli holati uchun avval sabab matnini kiriting.' });
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
            markedByTeacherId: teacher.id,
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
            markedByTeacherId: teacher.id,
          },
        })
      )
    );

    // Kelmagan o'quvchilarning ota-onasiga Telegram xabari
    const absentRecords = (records as Array<{ studentId: number; status: string }>).filter(
      r => r.status === 'KELMADI' || r.status === 'SABABLI'
    );
    if (absentRecords.length > 0) {
      const absentIds = absentRecords.map(r => Number(r.studentId));
      const absentStudents = await prisma.student.findMany({
        where: { id: { in: absentIds }, parentTelegramChatId: { not: null } },
        select: { id: true, fullName: true, parentTelegramChatId: true },
      });
      if (absentStudents.length > 0) {
        const statusMap = new Map(absentRecords.map(r => [Number(r.studentId), r.status]));
        notifyAbsentParents(absentStudents, group.name, String(date), statusMap).catch(console.error);
      }
    }

    return res.json({
      message: 'Davomat muvaffaqiyatli saqlandi.',
      savedRecords,
    });
  } catch (error: any) {
    console.error('saveGroupAttendance xatosi:', error);
    return res.status(500).json({ message: 'Davomatni saqlashda xatolik.', error: error.message });
  }
};

// Save a grade for a student
export const saveStudentGrade = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    const teacher = await prisma.teacher.findUnique({ where: { userId } });

    if (!teacher) {
      return res.status(404).json({ message: 'O\'qituvchi topilmadi.' });
    }

    const { studentId, score, comment, date } = req.body;

    if (!studentId || score === undefined || !date) {
      return res.status(400).json({ message: 'studentId, score va date kiritilishi shart.' });
    }

    const grade = await prisma.grade.create({
      data: {
        studentId: Number(studentId),
        teacherId: teacher.id,
        score: Number(score),
        comment: comment || '',
        date: String(date),
      },
      include: {
        student: { include: { group: true } },
      },
    });

    return res.status(201).json({
      message: 'Baho muvaffaqiyatli saqlandi.',
      grade,
    });
  } catch (error: any) {
    return res.status(500).json({ message: 'Bahoni saqlashda xatolik.', error: error.message });
  }
};

// Get grades given by this teacher
export const getTeacherGrades = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    const teacher = await prisma.teacher.findUnique({ where: { userId } });

    if (!teacher) {
      return res.status(404).json({ message: 'O\'qituvchi topilmadi.' });
    }

    const { groupId, date } = req.query;
    const where: any = { teacherId: teacher.id };

    if (date) where.date = String(date);
    if (groupId) {
      where.student = { groupId: Number(groupId) };
    }

    const grades = await prisma.grade.findMany({
      where,
      include: {
        student: { include: { group: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    return res.json(grades);
  } catch (error: any) {
    return res.status(500).json({ message: 'Baholarni yuklashda xatolik.', error: error.message });
  }
};
