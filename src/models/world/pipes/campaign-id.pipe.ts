import { Injectable, PipeTransform } from "@nestjs/common";
import { CampaignService } from "../services/campaign.service";

/**
 * Spec 027 (M2, AC2.10 / bug D3) — resolve `:id` em rotas `/campaigns/:id/*`
 * para UUID canônico.
 *
 * Aceita slug (`misterio-aldeia-campaign`) ou UUID. Faz lookup via
 * `CampaignService.resolveId(slugOrId)` que retorna o UUID ou lança
 * `NotFoundException` se não achar.
 *
 * Uso:
 *   @Param("id", CampaignIdPipe) campaignId: string
 *
 * Pipe rodando ANTES do handler garante que `campaignId` já chega resolvido,
 * eliminando 500s tipo "invalid input syntax for type uuid: 'misterio-...'"
 * em queries downstream (ambianceService, weatherService, etc.).
 */
@Injectable()
export class CampaignIdPipe implements PipeTransform<string, Promise<string>> {
  constructor(private readonly campaignService: CampaignService) {}

  async transform(value: string): Promise<string> {
    return this.campaignService.resolveId(value);
  }
}
