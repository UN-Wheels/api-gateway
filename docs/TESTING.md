# API Gateway — Testing Guide

All tests go through the gateway at `http://localhost:8080`. The Postman collection (`UN-Wheels.postman_collection.json` at repo root) covers all flows described here.

## Prerequisites

All three services must be running before testing:

```bash
# loggueo_service (port 8000)
cd loggueo_service && uvicorn app.main:app --reload --port 8000

# routes-reservations-service (port set in .env)
cd routes-reservations-service && npm run dev

# api-gateway (port 8080)
cd api-gateway && npm run start:dev
```

Required environment variables in `api-gateway`:
```
JWT_SECRET=<same value as loggueo_service>
AUTH_SERVICE_URL=http://localhost:8000
ROUTES_SERVICE_URL=http://localhost:<routes-service-port>
```

## Auth flow

The gateway uses **HttpOnly cookies** for auth. Postman handles the cookie automatically after login — no manual token management needed.

### 1. Register

```
POST /api/auth/register
Content-Type: application/json

{
  "name": "Juan García",
  "email": "juan.garcia@unal.edu.co",
  "password": "password123",
  "role": "estudiante"
}
```

Expected: `201` with user object (no password).

### 2. Login

```
POST /api/auth/login
Content-Type: application/json

{
  "username": "juan.garcia@unal.edu.co",
  "password": "password123"
}
```

Expected: `200 { "message": "Login exitoso" }` + `Set-Cookie: access_token=<jwt>; HttpOnly`.

### 3. Get current user

```
GET /api/auth/me
```

Expected: `200` with full user object. Returns `401` if cookie is missing or expired.

### 4. Logout

```
POST /api/auth/logout
```

Expected: `200`. Cookie is cleared — subsequent authenticated requests return `401`.

---

## Public user info (enrichment endpoint)

```
GET /api/auth/users/juan.garcia@unal.edu.co
```

Expected: `200 { "name": "Juan García", "email": "...", "role": "estudiante", "rating": 0 }`  
Returns `404` for unknown emails, `401` without valid session.

---

## Routes enrichment

To test enrichment, a route with a vehicle must exist. Minimum setup:

1. Login as a conductor
2. `POST /api/vehicles/` → note returned `id` (e.g. `3`)
3. `POST /api/routes/routes/` with `"vehicleId": "3"`
4. `POST /api/routes/routes/:id/availability/rules` with future dates

### GET /api/routes/routes/available

Expected response shape (no raw IDs — all replaced with objects):

```json
[
  {
    "_id": "...",
    "driver": { "name": "María Conductora", "email": "...", "role": "conductor", "rating": 4.5 },
    "vehicle": { "plate": "ABC123", "vehicle_type": "carro", "brand": "toyota", "model": "corolla", "color": "blanco", "year": 2020 },
    "origin": { "name": "Portal Norte", "lat": 4.7602, "lng": -74.0465 },
    "destination": { "name": "Universidad Nacional", "lat": 4.6357, "lng": -74.0826 },
    "pricePerSeat": 5000,
    "status": "ACTIVE"
  }
]
```

Fields `driverId` and `vehicleId` must **not** appear.

### GET /api/routes/routes/:id

Same enrichment as above on a single route object.

---

## Reservations enrichment

### As passenger — GET /api/routes/reservations/me/passenger/requests

Expected: array of reservations. Each item:
- `routeId` is a populated route object with `driver` (not `driverId`) and `vehicle` (not `vehicleId`)
- No `passengerId` at top level (passenger is the current user, not shown)

### As conductor — GET /api/routes/reservations/me/driver/requests

Expected: array of reservations where `passenger` object replaces `passengerId`:

```json
[
  {
    "_id": "...",
    "passenger": { "name": "Juan García", "email": "juan.garcia@unal.edu.co", "role": "estudiante", "rating": 0 },
    "routeId": {
      "driver": { "name": "María Conductora", ... },
      "vehicle": { "plate": "ABC123", ... },
      "origin": { ... },
      "destination": { ... }
    },
    "status": "PENDING",
    "travelDate": "2026-05-10T00:00:00.000Z"
  }
]
```

---

## Error cases

| Scenario | Expected |
|---|---|
| Request to any authenticated route without cookie | `401 Unauthorized` |
| `GET /api/auth/users/nonexistent@unal.edu.co` | `404 { "detail": "Usuario no encontrado" }` |
| `POST /api/routes/routes/` without conductor session | `401` from routes-service |
| Gateway started without `ROUTES_SERVICE_URL` | `503 { "message": "Routes service not available yet" }` |

---

## Postman test scripts

The collection includes automated tests on these requests:

| Request | Tests |
|---|---|
| Rutas disponibles | `driver.name` present, `driverId` absent, `vehicle.plate` present if vehicle assigned |
| Obtener ruta por ID | `driver.name`, `driver.email`, `driver.rating`, `vehicle.plate` present |
| Solicitudes pendientes recibidas (conductor) | `passenger.name` present, `passengerId` absent |
| Mis solicitudes (pasajero) | `routeId.driver.name` present, `routeId.driverId` absent |
| Obtener usuario por email | `name`, `email`, `role`, `rating` present; `id`, `phone_number` absent |
| Obtener usuario por email — sin auth | `401` |
| Obtener usuario por email — no existe | `404` |
