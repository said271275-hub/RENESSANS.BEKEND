import { Router } from 'express';
import {
  getDashboardStats,
  getStudents,
  createStudent,
  updateStudent,
  deleteStudent,
  getTeachers,
  createTeacher,
  updateTeacher,
  deleteTeacher,
  resetTeacherCredentials,
  getGroups,
  createGroup,
  updateGroup,
  deleteGroup,
  getAdminAttendances,
  saveAdminAttendance,
  getPayments,
  createPayment,
  deletePayment,
} from '../controllers/adminController';
import { authenticateToken, requireRole } from '../middleware/auth';
import {
  getGroupPaymentSummaries,
  getGroupPaymentDetails,
  calculateGroupPayroll,
  updateTeacherSalarySettings,
  confirmGroupPayroll,
} from '../controllers/paymentAnalyticsController';

const router = Router();

// Protect all admin routes for ADMIN role (Managers can also read groups/teachers if needed)
router.use(authenticateToken);
router.use(requireRole(['ADMIN']));

// Dashboard
router.get('/dashboard', getDashboardStats);

// Students
router.get('/students', getStudents);
router.post('/students', createStudent);
router.put('/students/:id', updateStudent);
router.delete('/students/:id', deleteStudent);

// Teachers
router.get('/teachers', getTeachers);
router.post('/teachers', createTeacher);
router.put('/teachers/:id', updateTeacher);
router.post('/teachers/:id/credentials', resetTeacherCredentials);
router.delete('/teachers/:id', deleteTeacher);

// Groups
router.get('/groups', getGroups);
router.post('/groups', createGroup);
router.put('/groups/:id', updateGroup);
router.delete('/groups/:id', deleteGroup);

// Attendance View
router.get('/attendance', getAdminAttendances);
router.post('/attendance', saveAdminAttendance);

// Payments (To'lovlar)
router.get('/payments', getPayments);
router.post('/payments', createPayment);
router.delete('/payments/:id', deletePayment);
router.get('/payment-groups', getGroupPaymentSummaries);
router.get('/payment-groups/:groupId', getGroupPaymentDetails);
router.post('/payment-groups/:groupId/payroll/calculate', calculateGroupPayroll);
router.put('/teachers/:teacherId/salary', updateTeacherSalarySettings);
router.post('/payment-groups/:groupId/payroll/confirm', confirmGroupPayroll);

export default router;
