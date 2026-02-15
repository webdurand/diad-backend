# Library API and admin seeding (Backend)

## Goal
Provide read-only SRD 5.2.1 data to the frontend and keep the database seeded from JSON sources.

## Data sources
- SRD JSON files live in `src/data/json/` (27 JSON files).
- Each seed method reads a JSON file and upserts rows by slug.
- The raw SRD object is stored in the `raw` column for each entity.
- A comp source record is created once (code `SRD`) and linked to rows.

## Library API (read-only)
- Controller: `LibraryController` (`/library`).
- Service: `LibraryService` (uses `EntityManager` directly, no `forFeature`).
- Endpoint: `GET /library/:entity` — returns all rows for the given entity name.
- Not protected by any guard (public endpoint).
- This is used by the frontend to load SRD reference data with `staleTime: Infinity`.

Important contract:
- The frontend expects each row to include a `raw` field with the SRD shape.
- The `genericFetch` function in the frontend maps `{ id, raw }` to the SRD interface.

## Admin seeding
- Controller: `AdminController` (`/admin`).
- Service: `AdminService` (~1474 lines, handles all 27+ entity types).
- All seed endpoints live under `/admin` (not protected by guard).
- Each endpoint loads a JSON file and upserts by slug, resolving foreign keys.

Recommended order (phases):
- Phase 0: comp-sources
- Phase 1: ability-scores, alignments, conditions, damage-types, languages, magic-schools, weapon-properties, weapon-mastery-properties, rule-sections, equipment-categories, proficiencies
- Phase 2: skills, equipment, feats, rules
- Phase 3: classes, races
- Phase 4: subclasses, subraces, traits, backgrounds
- Phase 5: features, spells, magic-items, monsters, eldritch-invocations
- Phase 6: levels

Convenience endpoint:
- `POST /admin/seed-all` runs the full sequence above in order.

## SRD entities (41 reference tables)
Ability scores, alignments, backgrounds, classes, conditions, damage types, eldritch invocations, equipment, equipment categories, feats, features, languages, levels, magic items, magic schools, monsters, proficiencies, races, rules, rule sections, skills, spells, subclasses, subraces, traits, weapon mastery properties, weapon properties, plus junction tables (spell_classes, spell_subclasses, class_proficiencies, class_saving_throws, etc.).
