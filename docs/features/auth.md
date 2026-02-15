# Authentication (Backend)

## Goal
Provide user registration, login, logout, and session validation using JWT stored in httpOnly cookies.

## Module
- `AuthModule` exports `AuthService` and `AuthGuard`.
- Used by `CharactersModule` to protect all character endpoints.

## Endpoints

| Method | Route | Guard | Description |
|--------|-------|-------|-------------|
| POST | `/auth/register` | None | Register with email, password, name, username, birthDate, phone |
| POST | `/auth/login` | None | Login with email and password |
| POST | `/auth/logout` | None | Clear session cookie |
| GET | `/auth/me` | AuthGuard | Return current user from token |

## Session mechanics
- JWT signed with `JWT_SECRET` env var (fallback: `'dev-secret'`).
- Token stored in `diad_session` httpOnly cookie, 7-day expiry.
- Cookie config: `httpOnly: true`, `secure: true` (production), `sameSite: 'lax'`, `path: '/'`.
- Password hashing via `bcryptjs` (10 salt rounds).

## AuthGuard
- Implements NestJS `CanActivate`.
- Extracts token from `diad_session` cookie.
- Verifies via `AuthService.getUserFromToken()`.
- Sets `req.user` with `{ id, email, name, username }`.
- Returns 401 if token is missing or invalid.

## User entity
- Fields: `id` (UUID), `email` (unique), `name`, `username` (unique), `birthDate`, `phone`, `passwordHash`.
- Cascade delete to all characters.

## Validations (manual in service)
- Registration: checks for duplicate email and username, required fields.
- Login: checks email exists and password matches.
- Profile fields validated on register (name, username, birthDate required).
