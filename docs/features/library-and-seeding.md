# Library API and admin seeding (Backend)

## Goal
Provide read-only SRD data to the frontend and keep the database seeded from JSON sources.

## Data sources
- SRD JSON files live in src/data/json.
- Each seed method reads a JSON file and upserts rows.
- The raw SRD object is stored in the raw column for each entity.
- A comp source record is created once (code SRD) and linked to rows.

## Library API (read-only)
- Endpoint: GET /library/:entity
- Behavior: returns all rows for the given entity name.
- This is used by the frontend to load SRD reference data.

Important contract:
- The frontend expects each row to include a raw field with the SRD shape.

## Admin seeding
- All seed endpoints live under /admin.
- Each endpoint loads a JSON file and upserts by slug.
- Seed order matters because of foreign key dependencies.

Recommended order (phases):
- Phase 0: comp-sources
- Phase 1: ability-scores, alignments, conditions, damage-types, languages, magic-schools, weapon-properties, weapon-mastery-properties, rule-sections, equipment-categories, proficiencies
- Phase 2: skills, equipment, feats, rules
- Phase 3: classes, races
- Phase 4: subclasses, subraces, traits, backgrounds
- Phase 5: features, spells, magic-items, monsters
- Phase 6: levels

Convenience endpoint:
- POST /admin/seed-all runs the full sequence above.

## Current scope limits
- No endpoints for character persistence yet.
- The backend is a library data provider only.
