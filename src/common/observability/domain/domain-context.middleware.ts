import { Injectable, NestMiddleware } from "@nestjs/common";
import type { NextFunction, Request, Response } from "express";
import { ClsService } from "nestjs-cls";
import { DOMAIN_HEADER, parseDomainHeader } from "./domain-context";

export const DOMAIN_CLS_KEY = "domain";


@Injectable()
export class DomainContextMiddleware implements NestMiddleware {
  constructor(private readonly cls: ClsService) {}

  use(req: Request, _res: Response, next: NextFunction): void {
    try {
      const header = req.headers[DOMAIN_HEADER];
      const ctx = parseDomainHeader(header);
      if (Object.keys(ctx).length > 0) {
        this.cls.set(DOMAIN_CLS_KEY, ctx);
      }
    } catch {

    }
    next();
  }
}
