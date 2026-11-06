import { Request } from 'express';

export type UserRole = 'ADMIN' | 'MANAGER' | 'TEACHER';

export interface TokenPayload {
  userId: number;
  fullName: string;
  login: string;
  role: UserRole;
  teacherId?: number;
}

export interface AuthenticatedRequest extends Request {
  user?: TokenPayload;
}
