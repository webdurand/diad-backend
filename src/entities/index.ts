import { AbilityScoreEntity } from "./ability-score.entity";
import { AlignmentEntity } from "./alignment.entity";
import { BackgroundEntity } from "./background.entity";
import { BackgroundProficiencyEntity } from "./background-proficiency.entity";
import { CharacterAbilityScoreEntity } from "./character-ability-score.entity";
import { CharacterClassEntity } from "./character-class.entity";
import { CharacterEquipmentEntity } from "./character-equipment.entity";
import { CharacterFeatureEntity } from "./character-feature.entity";
import { CharacterLevelUpEntity } from "./character-level-up.entity";
import { CharacterMagicItemEntity } from "./character-magic-item.entity";
import { CharacterOriginEntity } from "./character-origin.entity";
import { CharacterProficiencyEntity } from "./character-proficiency.entity";
import { CharacterSkillEntity } from "./character-skill.entity";
import { CharacterSpellEntity } from "./character-spell.entity";
import { CharacterStateEntity } from "./character-state.entity";
import { ClassEntity } from "./class.entity";
import { ClassProficiencyEntity } from "./class-proficiency.entity";
import { ClassSavingThrowEntity } from "./class-saving-throw.entity";
import { ClassStartingEquipmentEntity } from "./class-starting-equipment.entity";
import { CompSourceEntity } from "./comp-source.entity";
import { ConditionEntity } from "./condition.entity";
import { DamageTypeEntity } from "./damage-type.entity";
import { EquipmentCategoryEntity } from "./equipment-category.entity";
import { EquipmentCategoryItemEntity } from "./equipment-category-item.entity";
import { EquipmentEntity } from "./equipment.entity";
import { OptionalFeatureEntity } from "./optional-feature.entity";
import { FeatEntity } from "./feat.entity";
import { FeatureEntity } from "./feature.entity";
import { LanguageEntity } from "./language.entity";
import { LevelEntity } from "./level.entity";
import { LevelFeatureEntity } from "./level-feature.entity";
import { MagicItemEntity } from "./magic-item.entity";
import { MagicItemVariantEntity } from "./magic-item-variant.entity";
import { MagicSchoolEntity } from "./magic-school.entity";
import { MonsterEntity } from "./monster.entity";
import { ProficiencyEntity } from "./proficiency.entity";
import { RaceEntity } from "./race.entity";
import { RaceLanguageEntity } from "./race-language.entity";
import { RaceTraitEntity } from "./race-trait.entity";
import { RuleEntity } from "./rule.entity";
import { RuleSectionEntity } from "./rule-section.entity";
import { RuleSectionLinkEntity } from "./rule-section-link.entity";
import { SkillEntity } from "./skill.entity";
import { SpellEntity } from "./spell.entity";
import { SpellClassEntity } from "./spell-class.entity";
import { SpellSubclassEntity } from "./spell-subclass.entity";
import { SubclassEntity } from "./subclass.entity";
import { SubraceEntity } from "./subrace.entity";
import { SubraceTraitEntity } from "./subrace-trait.entity";
import { TraitEntity } from "./trait.entity";
import { TraitProficiencyEntity } from "./trait-proficiency.entity";
import { WeaponMasteryPropertyEntity } from "./weapon-mastery-property.entity";
import { WeaponPropertyEntity } from "./weapon-property.entity";
import { UserEntity } from "./user.entity";
import { CharacterEntity } from "./character.entity";
import { CompanionTemplateEntity } from "./companion-template.entity";
import { CampaignPartyMemberEntity } from "./campaign-party-member.entity";
import { GameSessionEntity } from "./game-session.entity";
import { EncounterEntity } from "./encounter.entity";
import { EncounterParticipantEntity } from "./encounter-participant.entity";
import { PersistentAreaEffectEntity } from "./persistent-area-effect.entity";
import { GameEventEntity } from "./game-event.entity";
import { CampaignEntity } from "./campaign.entity";
import { CampaignPlayerEntity } from "./campaign-player.entity";
import { LocationEntity } from "./location.entity";
import { LocationPoiEntity } from "./location-poi.entity";
import { LocationConnectionEntity } from "./location-connection.entity";
import { NpcEntity } from "./npc.entity";
import { NpcArchetypeTemplateEntity } from "./npc-archetype-template.entity";
import { NpcRelationshipEntity } from "./npc-relationship.entity";
import { NpcStoryHookEntity } from "./npc-story-hook.entity";
import { PendingGuardDispatchEntity } from "./pending-guard-dispatch.entity";
import { FactionEntity } from "./faction.entity";
import { FactionRelationEntity } from "./faction-relation.entity";
import { StoryArcEntity } from "./story-arc.entity";
import { PhaseEntity } from "./phase.entity";
import { PhaseTransitionEntity } from "./phase-transition.entity";
import { QuestEntity } from "./quest.entity";
import { QuestObjectiveEntity } from "./quest-objective.entity";
import { QuestPrerequisiteEntity } from "./quest-prerequisite.entity";
import { LootTableEntity } from "./loot-table.entity";
import { LootTableItemEntity } from "./loot-table-item.entity";
import { EncounterTemplateEntity } from "./encounter-template.entity";
import { EncounterJoinRequestEntity } from "./encounter-join-request.entity";
import { SceneEntity } from "./scene.entity";
import { OpeningArchetypeEntity } from "./opening-archetype.entity";
import { SceneNpcEntity } from "./scene-npc.entity";
import { ScenePoiObservationEntity } from "./scene-poi-observation.entity";
import { SessionEventEntity } from "./session-event.entity";
import { SessionMessageEntity } from "./session-message.entity";
import { CampaignChronicleEntity } from "./campaign-chronicle.entity";
import { PartyKnowledgeEntity } from "./party-knowledge.entity";
import { ClockEntity } from "./clock.entity";
import { NarrativeDecisionEntity } from "./narrative-decision.entity";
import { ContinuityFactEntity } from "./continuity-fact.entity";
import { LoreEntryEntity } from "./lore-entry.entity";
import { EndingSlideEntity } from "./ending-slide.entity";
import { VoiceProfileEntity } from "./voice-profile.entity";
import { AiUsageLogEntity } from "./ai-usage-log.entity";

import { RestSessionEntity } from "./rest-session.entity";
import { RestEventTemplateEntity } from "./rest-event-template.entity";
import { ReactionDefaultEntity } from "./reaction-default.entity";
import { XpAwardEventEntity } from "./xp-award-event.entity";

import { AudienceRoutingEntity } from "./audience-routing.entity";
import { CampaignAudienceOverrideEntity } from "./campaign-audience-override.entity";
import { EventSubscriberEntity } from "./event-subscriber.entity";
import { EventListenerProcessedEntity } from "./event-listener-processed.entity";

import { WeatherEntity } from "./weather.entity";
import { GameClockEntity } from "./game-clock.entity";

import { SessionNpcStateEntity } from "./session-npc-state.entity";
import { SessionFactionStateEntity } from "./session-faction-state.entity";
import { SessionStoryArcStateEntity } from "./session-story-arc-state.entity";

import { AdminAuditLogEntity } from "./admin-audit-log.entity";
import { MetaQueryAuditEntity } from "./meta-query-audit.entity";

export {
  AbilityScoreEntity,
  AlignmentEntity,
  BackgroundEntity,
  BackgroundProficiencyEntity,
  CharacterAbilityScoreEntity,
  CharacterClassEntity,
  CharacterEquipmentEntity,
  CharacterFeatureEntity,
  CharacterLevelUpEntity,
  CharacterMagicItemEntity,
  CharacterOriginEntity,
  CharacterProficiencyEntity,
  CharacterSkillEntity,
  CharacterSpellEntity,
  CharacterStateEntity,
  ClassEntity,
  ClassProficiencyEntity,
  ClassSavingThrowEntity,
  ClassStartingEquipmentEntity,
  CompSourceEntity,
  ConditionEntity,
  DamageTypeEntity,
  EquipmentCategoryEntity,
  EquipmentCategoryItemEntity,
  EquipmentEntity,
  OptionalFeatureEntity,
  FeatEntity,
  FeatureEntity,
  LanguageEntity,
  LevelEntity,
  LevelFeatureEntity,
  MagicItemEntity,
  MagicItemVariantEntity,
  MagicSchoolEntity,
  MonsterEntity,
  ProficiencyEntity,
  RaceEntity,
  RaceLanguageEntity,
  RaceTraitEntity,
  RuleEntity,
  RuleSectionEntity,
  RuleSectionLinkEntity,
  SkillEntity,
  SpellEntity,
  SpellClassEntity,
  SpellSubclassEntity,
  SubclassEntity,
  SubraceEntity,
  SubraceTraitEntity,
  TraitEntity,
  TraitProficiencyEntity,
  WeaponMasteryPropertyEntity,
  WeaponPropertyEntity,
  UserEntity,
  CharacterEntity,
  CompanionTemplateEntity,
  CampaignPartyMemberEntity,
  GameSessionEntity,
  EncounterEntity,
  EncounterParticipantEntity,
  PersistentAreaEffectEntity,
  GameEventEntity,
  CampaignEntity,
  CampaignPlayerEntity,
  LocationEntity,
  LocationPoiEntity,
  LocationConnectionEntity,
  NpcEntity,
  NpcArchetypeTemplateEntity,
  NpcRelationshipEntity,
  NpcStoryHookEntity,
  PendingGuardDispatchEntity,
  FactionEntity,
  FactionRelationEntity,
  StoryArcEntity,
  PhaseEntity,
  PhaseTransitionEntity,
  QuestEntity,
  QuestObjectiveEntity,
  QuestPrerequisiteEntity,
  LootTableEntity,
  LootTableItemEntity,
  EncounterTemplateEntity,
  EncounterJoinRequestEntity,
  SceneEntity,
  OpeningArchetypeEntity,
  SceneNpcEntity,
  ScenePoiObservationEntity,
  SessionEventEntity,
  SessionMessageEntity,
  CampaignChronicleEntity,
  PartyKnowledgeEntity,
  ClockEntity,
  NarrativeDecisionEntity,
  ContinuityFactEntity,
  LoreEntryEntity,
  EndingSlideEntity,
  VoiceProfileEntity,
  AiUsageLogEntity,
  RestSessionEntity,
  RestEventTemplateEntity,
  ReactionDefaultEntity,
  XpAwardEventEntity,
  AudienceRoutingEntity,
  CampaignAudienceOverrideEntity,
  EventSubscriberEntity,
  EventListenerProcessedEntity,
  WeatherEntity,
  GameClockEntity,
  SessionNpcStateEntity,
  SessionFactionStateEntity,
  SessionStoryArcStateEntity,
  AdminAuditLogEntity,
  MetaQueryAuditEntity,
};

export const ENTITIES = [
  AbilityScoreEntity,
  AlignmentEntity,
  BackgroundEntity,
  BackgroundProficiencyEntity,
  CharacterAbilityScoreEntity,
  CharacterClassEntity,
  CharacterEquipmentEntity,
  CharacterFeatureEntity,
  CharacterLevelUpEntity,
  CharacterMagicItemEntity,
  CharacterOriginEntity,
  CharacterProficiencyEntity,
  CharacterSkillEntity,
  CharacterSpellEntity,
  CharacterStateEntity,
  ClassEntity,
  ClassProficiencyEntity,
  ClassSavingThrowEntity,
  ClassStartingEquipmentEntity,
  CompSourceEntity,
  ConditionEntity,
  DamageTypeEntity,
  EquipmentCategoryEntity,
  EquipmentCategoryItemEntity,
  EquipmentEntity,
  OptionalFeatureEntity,
  FeatEntity,
  FeatureEntity,
  LanguageEntity,
  LevelEntity,
  LevelFeatureEntity,
  MagicItemEntity,
  MagicItemVariantEntity,
  MagicSchoolEntity,
  MonsterEntity,
  ProficiencyEntity,
  RaceEntity,
  RaceLanguageEntity,
  RaceTraitEntity,
  RuleEntity,
  RuleSectionEntity,
  RuleSectionLinkEntity,
  SkillEntity,
  SpellEntity,
  SpellClassEntity,
  SpellSubclassEntity,
  SubclassEntity,
  SubraceEntity,
  SubraceTraitEntity,
  TraitEntity,
  TraitProficiencyEntity,
  WeaponMasteryPropertyEntity,
  WeaponPropertyEntity,
  UserEntity,
  CharacterEntity,
  CompanionTemplateEntity,
  CampaignPartyMemberEntity,
  GameSessionEntity,
  EncounterEntity,
  EncounterParticipantEntity,
  PersistentAreaEffectEntity,
  GameEventEntity,
  CampaignEntity,
  CampaignPlayerEntity,
  LocationEntity,
  LocationPoiEntity,
  LocationConnectionEntity,
  NpcEntity,
  NpcArchetypeTemplateEntity,
  NpcRelationshipEntity,
  NpcStoryHookEntity,
  PendingGuardDispatchEntity,
  FactionEntity,
  FactionRelationEntity,
  StoryArcEntity,
  PhaseEntity,
  PhaseTransitionEntity,
  QuestEntity,
  QuestObjectiveEntity,
  QuestPrerequisiteEntity,
  LootTableEntity,
  LootTableItemEntity,
  EncounterTemplateEntity,
  EncounterJoinRequestEntity,
  SceneEntity,
  OpeningArchetypeEntity,
  SceneNpcEntity,
  ScenePoiObservationEntity,
  SessionEventEntity,
  SessionMessageEntity,
  CampaignChronicleEntity,
  PartyKnowledgeEntity,
  ClockEntity,
  NarrativeDecisionEntity,
  ContinuityFactEntity,
  LoreEntryEntity,
  EndingSlideEntity,
  VoiceProfileEntity,
  AiUsageLogEntity,
  RestSessionEntity,
  RestEventTemplateEntity,
  ReactionDefaultEntity,
  XpAwardEventEntity,
  AudienceRoutingEntity,
  CampaignAudienceOverrideEntity,
  EventSubscriberEntity,
  EventListenerProcessedEntity,
  WeatherEntity,
  GameClockEntity,
  SessionNpcStateEntity,
  SessionFactionStateEntity,
  SessionStoryArcStateEntity,
  AdminAuditLogEntity,
  MetaQueryAuditEntity,
];

export * from "./enums";
