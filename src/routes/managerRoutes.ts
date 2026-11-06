import { Router } from 'express';
import {
  getManagerOverview,
  getTransactions,
  createTransaction,
  updateTransaction,
  deleteTransaction,
  getMonthlyFinanceChart,
  getStudentRatings,
} from '../controllers/managerController';
import { authenticateToken, requireRole } from '../middleware/auth';
import {
  getGroups,
  getStudents,
  getPayments,
  createPayment,
  deletePayment,
} from '../controllers/adminController';
import {
  getGroupPaymentSummaries,
  getGroupPaymentDetails,
  calculateGroupPayroll,
  confirmGroupPayroll,
} from '../controllers/paymentAnalyticsController';

const router = Router();

// Protect for MANAGER and ADMIN
router.use(authenticateToken);
router.use(requireRole(['MANAGER', 'ADMIN']));

// Overview statistics
router.get('/overview', getManagerOverview);

// Finance
router.get('/transactions', getTransactions);
router.post('/transactions', requireRole(['ADMIN']), createTransaction);
router.put('/transactions/:id', requireRole(['ADMIN']), updateTransaction);
router.delete('/transactions/:id', requireRole(['ADMIN']), deleteTransaction);
router.get('/chart', getMonthlyFinanceChart);

// Payments
router.get('/payments', getPayments);
router.post('/payments', createPayment);
router.delete('/payments/:id', deletePayment);
router.get('/students', getStudents);
router.get('/payment-groups', getGroupPaymentSummaries);
router.get('/payment-groups/:groupId', getGroupPaymentDetails);
router.post('/payment-groups/:groupId/payroll/calculate', calculateGroupPayroll);
router.post('/payment-groups/:groupId/payroll/confirm', requireRole(['ADMIN']), confirmGroupPayroll);

// Rating
router.get('/ratings', getStudentRatings);
router.get('/groups', getGroups);

export default router;
