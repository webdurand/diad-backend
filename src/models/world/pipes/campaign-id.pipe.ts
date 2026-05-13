import { Injectable, PipeTransform } from "@nestjs/common";
import { CampaignService } from "../services/campaign.service";


@Injectable()
export class CampaignIdPipe implements PipeTransform<string, Promise<string>> {
  constructor(private readonly campaignService: CampaignService) {}

  async transform(value: string): Promise<string> {
    return this.campaignService.resolveId(value);
  }
}
