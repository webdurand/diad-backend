import { Request } from "express";

export interface AuthUserPayload {
  id: string;
  email: string;
  name?: string;
  username?: string;
  role?: "user" | "admin";
}

export interface AuthRequest extends Request {
  user?: AuthUserPayload;
}
