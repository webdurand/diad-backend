import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from "@nestjs/common";
import { AuthGuard } from "../auth/auth.guard";
import {
  AudienceMapEntry,
  AudienceMapService,
} from "src/common/event-bus/audience-map.service";
import { EventBusService } from "src/common/event-bus/event-bus.service";
import { EventEnvelopeFactory } from "src/common/event-bus/event-envelope.factory";
import { TRACE_ID_REGEX } from "src/common/event-bus/event-envelope.types";
import { parseTraceparent } from "src/common/observability/trace/trace-context";
import { DomainException } from "src/common/observability/errors/diad-exception";
import { ErrorCode } from "src/common/observability/errors/error-codes.catalog";
import { PublishEventDto } from "./dto/publish-event.dto";


@Controller()
@UseGuards(AuthGuard)
export class EventBusController {
  constructor(
    private readonly eventBus: EventBusService,
    private readonly audienceMap: AudienceMapService,
    private readonly factory: EventEnvelopeFactory,
  ) {}

  @Get("campaigns/:id/audience-map")
  async getAudienceMap(
    @Param("id", new ParseUUIDPipe()) campaignId: string,
  ): Promise<{ campaignId: string; entries: AudienceMapEntry[] }> {
    const entries = await this.audienceMap.getCampaignMap(campaignId);
    return { campaignId, entries };
  }

  @Post("events/publish")
  @HttpCode(202)
  async publishEvent(
    @Body() dto: PublishEventDto,
    @Headers("traceparent") traceparent: string | undefined,
  ) {
    const traceId = this.resolveTraceId(traceparent, dto.source.traceId);

    const envelope = this.factory.build({
      eventCategory: dto.eventCategory,
      eventType: dto.eventType,
      source: { ...dto.source, traceId },
      scope: dto.scope,
      payload: dto.payload,
      aggregateId: dto.aggregateId,
      audiences: dto.audiences,
      narrativeDescriptor: dto.narrativeDescriptor,
      metadata: dto.metadata,
      version: dto.version,
      eventId: dto.eventId,
      timestamp: dto.timestamp,
    });



    return await this.eventBus.publish(envelope);
  }

  private resolveTraceId(
    header: string | undefined,
    bodyTraceId: string | undefined,
  ): string {
    if (header) {
      const parsed = parseTraceparent(header);
      if (!parsed) {
        throw new DomainException(
          ErrorCode.TRACE_ID_INVALID,
          "Header traceparent não segue o formato W3C 00-{32hex}-{16hex}-{2hex}.",
          {
            context: { traceparent: header },
            hint: "Use OutboundFetch ou propague o header recebido como veio do upstream.",
          },
        );
      }
      return parsed.traceId;
    }
    if (bodyTraceId && TRACE_ID_REGEX.test(bodyTraceId)) {
      return bodyTraceId;
    }
    if (bodyTraceId && !TRACE_ID_REGEX.test(bodyTraceId)) {
      throw new DomainException(
        ErrorCode.TRACE_ID_INVALID,
        "source.traceId precisa seguir W3C (32 hex lowercase).",
        { context: { traceId: bodyTraceId } },
      );
    }

    return "";
  }
}
