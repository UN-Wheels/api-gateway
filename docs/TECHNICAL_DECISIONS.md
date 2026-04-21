# API Gateway — Technical Decisions

## 1. NestJS controller for routes instead of proxy middleware

**Decision:** `RoutesGatewayController` handles `api/routes/*` as a NestJS controller with `HttpService`, replacing the previous `http-proxy-middleware` block in `app.module.ts`.

**Why:** `http-proxy-middleware` streams the response directly to the client — there is no opportunity to inspect or modify the response body. Enriching user/vehicle data requires reading the upstream JSON, transforming it, and re-serializing. This is only possible when the gateway owns the response lifecycle, which NestJS controllers provide.

**Trade-off:** Slightly higher memory usage (response body is buffered in memory before sending). Acceptable given typical response sizes for this domain.

---

## 2. Recursive enrichment over field-specific logic

**Decision:** The `enrich()` method recursively walks the entire JSON tree rather than having endpoint-specific transformation rules.

**Why:** Routes service responses have variable shapes:
- `GET /routes/available` → array of route objects (each with `driverId`)
- `GET /reservations/me/driver/requests` → array of reservations with `routeId` populated as a nested route object (also has `driverId`) and a top-level `passengerId`
- `GET /routes/:id/optimized` → route with `stops[]` each containing `passengerId`

Writing a separate transformer per endpoint would require updating the gateway every time the routes service adds a field or endpoint. The recursive approach handles all cases automatically, including future nested structures.

**Trade-off:** If a field named `driverId`, `passengerId`, or `vehicleId` appears in a context where enrichment is not desired, it would be incorrectly replaced. This has not occurred in practice and the field names are domain-specific enough to be safe.

---

## 3. Per-request in-memory cache for enrichment lookups

**Decision:** Each proxy request creates a fresh `Map<string, any>` cache. The same email/vehicleId is only fetched once per request even if it appears multiple times in the response.

**Why:** A list of reservations from a single driver will include the same `driverId` string on every item. Without caching, a list of 20 reservations from the same driver would trigger 20 identical HTTP calls to loggueo_service. The cache eliminates the redundancy.

**Why not a global/persistent cache:** User data (name, rating) changes over time. A global cache would require invalidation logic and a TTL strategy. Per-request cache gives consistency within a response at zero implementation cost.

---

## 4. Enrich only on GET requests

**Decision:** The `enrich()` function is only called when `req.method === 'GET'`.

**Why:** Mutation endpoints (`POST`, `PATCH`, `DELETE`) return minimal confirmation objects or the mutated resource. The downstream service already handles validation — the gateway does not need to enrich these responses. Restricting enrichment to GET avoids unnecessary auth service calls on writes.

---

## 5. Graceful degradation when enrichment fails

**Decision:** If a call to loggueo_service fails (network error, 404, timeout), the field is replaced with a minimal fallback object `{ email: value }` or `{ id: value }` rather than failing the entire request.

**Why:** A route should still be visible to the user even if, for some reason, the auth service cannot resolve the driver's name. The routes data itself is complete — only the display name is missing. A hard failure on enrichment would make routes unavailable whenever the auth service has a transient issue.

---

## 6. @Public() on RoutesGatewayController

**Decision:** The entire `RoutesGatewayController` is marked `@Public()`, bypassing the global `JwtAuthGuard`. JWT validation is delegated to the routes-reservations-service's own middleware.

**Why:** The routes service has a mix of public endpoints (no auth required: `GET /routes/available`, `GET /routes/:id`, `GET /routes/:id/slots`) and protected endpoints. Reproducing this split in the gateway would couple gateway routing logic to routes-service auth rules. Since the routes service validates tokens independently and returns `401` when appropriate, double-validation at the gateway is redundant.

The gateway still forwards the JWT as a `Bearer` token when present in the cookie, so protected routes work correctly.

---

## 7. HttpOnly cookie for JWT storage

**Decision:** On login, the JWT is extracted from loggueo_service's JSON response and stored in an `HttpOnly` cookie named `access_token`. The token is never exposed in the response body to the frontend.

**Why:** `HttpOnly` cookies are inaccessible to JavaScript, preventing token theft via XSS. The frontend does not need to manage token storage or attach Authorization headers manually — the browser sends the cookie automatically with each request.

**Trade-off:** Requires `sameSite: 'lax'` and HTTPS in production (`secure: true` in production mode). REST clients (Postman) must have cookie management enabled to use authenticated endpoints.

---

## 8. JWT field normalization (sub → id)

**Decision:** The API Gateway's `JwtAuthGuard` normalizes the JWT payload: `req.user.id = decoded.user_id ?? decoded.sub`. The same normalization was added to the routes-reservations-service auth middleware.

**Why:** loggueo_service encodes the user email in the `sub` claim (standard JWT convention). The routes service was reading `req.user.id`, which did not exist in the payload, causing `driverId` to be `undefined` on route creation. Normalizing at the middleware level means all downstream code uses `req.user.id` consistently regardless of which JWT field carries the identifier.

---

## 9. Vehicles endpoint — ownership bypass for public info

**Decision:** A new `GET /api/v1/vehicles/public/{vehicle_id}` endpoint was added to loggueo_service that returns basic vehicle info without checking ownership.

**Why:** The existing `GET /api/v1/vehicles/{id}` endpoint validates that the vehicle belongs to the authenticated user. When a passenger views a route, they are not the owner of the driver's vehicle — calling the existing endpoint would return `404`. The public endpoint exposes only non-sensitive fields (`plate`, `vehicle_type`, `brand`, `model`, `color`, `year`) and still requires a valid JWT, limiting access to authenticated users only.
