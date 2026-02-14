# Features (Backend)

This folder documents the current backend features in simple language, focused on business rules.

## Current features
- Library API (read-only data for the SRD library): see library-and-seeding.md.
- Admin seeding pipeline (load SRD JSON into Postgres): see library-and-seeding.md.
- User authentication (email + password, JWT cookie).
- Character persistence (save/list characters per user).

## Notes
- Auth uses httpOnly cookies for the session.
- Keep this doc updated when features change.
