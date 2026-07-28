import { Injectable, Optional } from "@nestjs/common";
import { ClsService } from "nestjs-cls";
import type { Request } from "express";

const CLIENT_ID_KEY = "diad:client-id";

/**
 * Guarda o `X-Client-Id` da request no store do CLS.
 *
 * Existe para que qualquer emissão de evento em tempo real possa marcar a aba de
 * origem SEM ter de propagar `@Req()` por dezenas de handlers. Sem essa marca,
 * `encounter:invalidate` volta para a própria aba que agiu (socket.io
 * `server.to(room)` inclui o emissor) e ela refaz os 3 GETs que o snapshot na
 * resposta acabou de tornar desnecessários.
 */
@Injectable()
export class ClientIdContext {
  constructor(@Optional() private readonly cls?: ClsService) {}

  captureFrom(req: Request): string | null {
    const header = req.headers["x-client-id"];
    const clientId =
      typeof header === "string" && header.length > 0
        ? header
        : Array.isArray(header) && header.length > 0
          ? header[0]
          : null;

    if (clientId && this.cls?.isActive()) {
      this.cls.set(CLIENT_ID_KEY, clientId);
    }
    return clientId;
  }

  current(): string | null {
    if (!this.cls?.isActive()) return null;
    return this.cls.get<string | undefined>(CLIENT_ID_KEY) ?? null;
  }
}
