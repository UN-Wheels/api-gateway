# UN-Wheels API Gateway

Single entry point for all UN-Wheels microservices. Runs on port **8080**.

## Responsibilities

- Centralized JWT validation via global `JwtAuthGuard`
- Auth cookie management (`Set-Cookie` on login, `HttpOnly`)
- JWT forwarding as `Bearer` token to downstream services
- WebSocket proxy to chat-service
- **Response enrichment** for routes: replaces `driverId`, `passengerId`, `vehicleId` string IDs with full user/vehicle objects fetched from loggueo_service

## Microservices

| Service | Gateway prefix | Internal port | Implementation |
|---|---|---|---|
| loggueo_service | `/api/auth`, `/api/vehicles` | 8000 | `http-proxy-middleware` (vehicles), `AuthGatewayController` (auth) |
| chat-service | `/api/chat` + WebSocket | 3001 | `http-proxy-middleware` |
| routes-reservations-service | `/api/routes` | configurable | `RoutesGatewayController` |

## Routing architecture

```
Request
  │
  ├─ /api/vehicles/*  ──► http-proxy-middleware ──► loggueo_service /api/v1/vehicles/*
  │                        (JWT from cookie → Bearer)
  │
  ├─ /api/chat/*      ──► http-proxy-middleware ──► chat-service
  │                        (JWT validated, X-User-Id / X-User-Role injected)
  │
  ├─ /api/auth/*      ──► AuthGatewayController ──► loggueo_service /api/v1/auth/*
  │                        (login sets HttpOnly cookie, other routes proxied)
  │
  └─ /api/routes/*    ──► RoutesGatewayController ──► routes-reservations-service
                           (proxies + enriches GET responses)
```

## Auth endpoints (AuthGatewayController)

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/api/auth/register` | Public | Register new user |
| `POST` | `/api/auth/login` | Public | Login — sets `access_token` HttpOnly cookie |
| `POST` | `/api/auth/logout` | Required | Clears auth cookie |
| `GET` | `/api/auth/me` | Required | Current authenticated user |
| `PUT` | `/api/auth/me` | Required | Update profile |
| `GET` | `/api/auth/users/:email` | Required | Public user info by email (used for enrichment) |

## Response enrichment

`RoutesGatewayController` intercepts all `GET /api/routes/*` responses and recursively replaces:

| Field in DB | Replaced with | Source endpoint |
|---|---|---|
| `driverId: "email@unal.edu.co"` | `driver: { name, email, role, rating }` | `GET /api/v1/auth/users/{email}` |
| `passengerId: "email@unal.edu.co"` | `passenger: { name, email, role, rating }` | `GET /api/v1/auth/users/{email}` |
| `vehicleId: "3"` | `vehicle: { plate, vehicle_type, brand, model, color, year }` | `GET /api/v1/vehicles/public/{id}` |

Enrichment uses a **per-request cache** to avoid duplicate lookups when the same ID appears multiple times in a response.

## Environment variables

| Variable | Default | Description |
|---|---|---|
| `PORT` | `8080` | Gateway listen port |
| `JWT_SECRET` | `dev_secret_change_me` | Shared JWT signing secret |
| `AUTH_SERVICE_URL` | `http://localhost:8000` | loggueo_service base URL |
| `CHAT_SERVICE_URL` | `http://localhost:3001` | chat-service base URL |
| `ROUTES_SERVICE_URL` | _(empty)_ | routes-reservations-service URL. Empty → 503 stub |
| `FRONTEND_URL` | `http://localhost:5173` | Allowed CORS origin |
| `COOKIE_MAX_AGE` | `1800` | Auth cookie max age in seconds |

## Branches

- `main` — stable and deployable
- `develop` — integration branch
- `feature/*` — feature development

## Stack

- Node.js 18 + NestJS
- TypeScript
- `@nestjs/axios` (HttpService) for internal service-to-service calls
- `http-proxy-middleware` for vehicles and chat proxy
- `cookie-parser` for cookie management
- `jsonwebtoken` for JWT validation

## Docs

- [`docs/TESTING.md`](docs/TESTING.md) — how to test all gateway routes
- [`docs/TECHNICAL_DECISIONS.md`](docs/TECHNICAL_DECISIONS.md) — architectural decisions and trade-offs
