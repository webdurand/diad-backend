import { IsOptional, IsUUID } from 'class-validator';

/**
 * Body for POST /encounters/:id/death-save/:participantId.
 *
 * Empty body is valid. Optional `ownerUserId` lets the DM act on behalf of a
 * player — the `PermissionResolver` validates that the caller is authorized
 * (owner or campaign DM) before accepting the override.
 */
export class DeathSaveDto {
  @IsOptional()
  @IsUUID()
  ownerUserId?: string;
}
