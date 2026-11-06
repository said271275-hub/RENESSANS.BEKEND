import { Router } from 'express';
import {
  getTeacherProfileAndStats,
  getMyGroups,
  createTeacherGroup,
  deleteTeacherGroup,
  getGroupStudentsEvaluation,
  saveStudentEvaluation,
  batchSaveGroupEvaluation,
  getGroupAttendanceByDate,
  saveAttendanceReason,
  saveGroupAttendance,
  saveStudentGrade,
  getTeacherGrades,
} from '../controllers/teacherController';
import { authenticateToken, requireRole } from '../middleware/auth';

const router = Router();

router.use(authenticateToken);
router.use(requireRole(['TEACHER', 'ADMIN']));

router.get('/profile', getTeacherProfileAndStats);
router.get('/groups', getMyGroups);
router.post('/groups', createTeacherGroup);
router.delete('/groups/:groupId', deleteTeacherGroup);
router.get('/groups/:groupId/evaluation', getGroupStudentsEvaluation);
router.post('/groups/:groupId/evaluation', saveStudentEvaluation);
router.post('/groups/:groupId/evaluation/batch', batchSaveGroupEvaluation);

router.get('/attendance', getGroupAttendanceByDate);
router.post('/attendance/reason', requireRole(['TEACHER']), saveAttendanceReason);
router.post('/attendance', saveGroupAttendance);
router.get('/grades', getTeacherGrades);
router.post('/grades', saveStudentGrade);

export default router;
