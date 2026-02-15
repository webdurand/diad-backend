# Features (Backend)

This folder documents the current backend features in simple language, focused on business rules.

## Current features
- **Library API** (read-only SRD data): see [library-and-seeding.md](library-and-seeding.md).
- **Admin seeding pipeline** (load SRD 5.2.1 JSON into Postgres): see [library-and-seeding.md](library-and-seeding.md).
- **User authentication** (email + password, JWT in httpOnly cookie): see [auth.md](auth.md).
- **Character management** (full CRUD + gameplay): see [characters.md](characters.md).
  - Character creation (materializes all choices into relational tables).
  - Computed character sheet (ability scores, AC, HP, skills, spells, etc.).
  - Level-up (multiclass, ASI/feat, subclass, spells, retroactive HP).
  - Spell management (prepared spells, spell slots, available spells).
  - Inventory (equipment, magic items, gold, equip/unequip, attunement, consumables).
  - Combat actions (weapon attacks, spell actions, feature actions, base actions).
  - Rest mechanics (short rest with hit dice, long rest with full recovery).
  - HP/XP/Death saves state management.

## Architecture overview
- 4 domain modules: AdminModule, AuthModule, LibraryModule, CharactersModule.
- 10 services total across all modules.
- 57 entities (41 SRD reference + 1 user + 15 character gameplay).
- 8 migrations.
- All character endpoints are protected by AuthGuard with ownership enforcement.

## Notes
- Auth uses httpOnly cookies (`diad_session`) with 7-day expiry.
- SRD data follows the 5.2.1 model.
- Keep this doc updated when features change.
