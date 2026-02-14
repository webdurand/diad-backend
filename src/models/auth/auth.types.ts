import { Request } from 'express';

export interface AuthUserPayload {
  id: string;
  email: string;
  name?: string;
  username?: string;
}

export interface AuthRequest extends Request {
  user?: AuthUserPayload;
}
