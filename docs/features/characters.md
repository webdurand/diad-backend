# Character management (Backend)

## Goal
Full character lifecycle: creation, computed sheet, level-up, spell management, inventory, combat actions, rest mechanics, and state tracking.

## Module
- `CharactersModule` imports `AuthModule` and applies `AuthGuard` to the entire controller.
- 7 services handle different aspects of character management.
- All endpoints enforce ownership via `userId` from JWT.

## Services

| Service | Lines | Responsibility |
|---------|-------|---------------|
| CharactersService | ~516 | CRUD. `create()` materializes ALL choices into relational tables via transaction |
| CharacterSheetService | ~880 | Computes full sheet: ability modifiers, AC, HP, initiative, saves, skills, spells, slots |
| CharacterStateService | ~260 | HP (damage/healing/temp), XP, death saves. Massive damage and auto-reset logic |
| LevelUpService | ~1023 | `getOptions()` + `execute()`. Multiclass prereqs, ASI, subclass, features, spells |
| SpellService | ~995 | Prepared spells, spell slot tracking, available spells, rest recovery |
| InventoryService | ~593 | Equipment + magic items CRUD, gold, equip/unequip, attunement (max 3), consumables |
| ActionsService | ~1116 | Compiles all actions: weapon, unarmed, spell, consumable, feature, base (Dodge, Dash, etc.) |

## Endpoints

### CRUD
| Method | Route | Description |
|--------|-------|-------------|
| GET | `/characters` | List user's characters |
| GET | `/characters/:id` | Get character detail |
| GET | `/characters/:id/sheet` | Get full computed character sheet |
| POST | `/characters` | Create character (materializes all choices) |
| PUT | `/characters/:id` | Update name |
| DELETE | `/characters/:id` | Delete character |

### State (HP, XP, Death Saves)
| Method | Route | Description |
|--------|-------|-------------|
| PATCH | `/characters/:id/hp` | Update HP (damage, healing, temp HP) |
| PATCH | `/characters/:id/xp` | Add XP |
| PATCH | `/characters/:id/death-saves` | Update death saves |

### Level Up
| Method | Route | Description |
|--------|-------|-------------|
| GET | `/characters/:id/level-up-options` | Get available level-up options |
| POST | `/characters/:id/level-up` | Execute level-up |

### Spells
| Method | Route | Description |
|--------|-------|-------------|
| GET | `/characters/:id/available-spells` | Get spells available to prepare/learn |
| PUT | `/characters/:id/prepared-spells` | Update prepared spells |
| PATCH | `/characters/:id/spell-slots` | Update spell slots used |

### Rest
| Method | Route | Description |
|--------|-------|-------------|
| POST | `/characters/:id/rest` | Short or long rest (recovers HP, slots, hit dice) |

### Inventory
| Method | Route | Description |
|--------|-------|-------------|
| GET | `/characters/:id/inventory` | Get full inventory |
| POST | `/characters/:id/inventory` | Add item |
| PATCH | `/characters/:id/inventory/:itemId` | Update item quantity |
| DELETE | `/characters/:id/inventory/:itemId` | Remove item |
| POST | `/characters/:id/inventory/:itemId/use` | Use consumable (auto-applies healing) |
| PATCH | `/characters/:id/gold` | Update gold (cp, sp, gp, pp) |
| PATCH | `/characters/:id/equipment/:itemId/equip` | Toggle equip/unequip |

### Magic Items
| Method | Route | Description |
|--------|-------|-------------|
| POST | `/characters/:id/magic-items` | Add magic item |
| DELETE | `/characters/:id/magic-items/:itemId` | Remove magic item |
| PATCH | `/characters/:id/magic-items/:itemId/attune` | Toggle attunement |

### Actions
| Method | Route | Description |
|--------|-------|-------------|
| GET | `/characters/:id/actions` | Get compiled action list |

## Character creation flow
When `POST /characters` is called, the service runs inside a `DataSource.transaction()` and materializes:
1. `CharacterEntity` — base record with name and userId.
2. `CharacterClassEntity` — class(es) with order (multiclass support) and optional subclass FK.
3. `CharacterAbilityScoreEntity` — 6 records (base + bonus per ability).
4. `CharacterSkillEntity` — selected skills with proficiency/expertise flag.
5. `CharacterProficiencyEntity` — all proficiencies with source enum (class/race/bg/multiclass/feat).
6. `CharacterSpellEntity` — known/prepared/spellbook spells with source and status.
7. `CharacterEquipmentEntity` — starting equipment with quantity and source.
8. `CharacterStateEntity` — initial state (max HP, 0 XP, gold, empty slots/dice).
9. `CharacterOriginEntity` — full creation data (race, subrace, background, alignment, personality, equipment choices, invocations, weapon mastery, etc.).
10. `CharacterFeatureEntity` — active features with choices jsonb.
11. `CharacterLevelUpEntity` — initial level-up record.

## Character sheet computation
`CharacterSheetService.getSheet()` computes:
- Ability scores with modifiers (base + bonuses from ASI, feats).
- AC (armor + DEX mod + shield, with formulas for unarmored defense).
- HP (sum of level-up HP gains + CON mod per level).
- Proficiency bonus (from total level).
- Saving throws (modifier + proficiency if proficient).
- Skills (modifier + proficiency/expertise bonus).
- Spell slots (full/half/pact magic tables based on caster levels).
- Spell details (cantrips, prepared, spellbook, always-prepared).
- Equipment with proficiency check.
- Initiative, speed, passive perception.

## Level-up mechanics
- `getOptions()` calculates: eligible classes (multiclass prerequisites), HP method (roll/average), ASI/feat availability, subclass selection (level 3), new features, new spells.
- `execute()` applies in transaction: new class level, HP gain, features, spells, proficiencies, ASI (with retroactive HP recalculation for CON changes).

## Rest mechanics
- **Short rest**: spend hit dice to heal, recover warlock pact slots.
- **Long rest**: recover all HP, all spell slots, half hit dice (minimum 1), reset death saves.

## Character entities (15 tables)
CharacterEntity, CharacterClassEntity, CharacterAbilityScoreEntity, CharacterSkillEntity, CharacterProficiencyEntity, CharacterSpellEntity, CharacterEquipmentEntity, CharacterMagicItemEntity, CharacterStateEntity, CharacterLevelUpEntity, CharacterFeatureEntity, CharacterOriginEntity (plus User entity).

## Key patterns
- **Eager loading**: character entities load SRD relations automatically.
- **Ownership check**: every query filters by `userId`.
- **Transaction safety**: creation and level-up wrap everything in `DataSource.transaction()`.
- **Enums**: proficiency sources, spell sources/statuses stored as Postgres enums.
- **`data` jsonb deprecated**: legacy backup field; real data lives in relational tables.
- **SRD constants**: proficiency bonus table, XP thresholds, spell slot tables, caster type mapping — all hardcoded in services.
