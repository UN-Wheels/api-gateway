# UN-Wheels API Gateway

Punto de entrada único para todos los microservicios de UN-Wheels.

## Responsabilidades

- Enrutamiento de requests hacia los microservicios
- Validación centralizada de JWT
- Gestión de cookies de autenticación (`Set-Cookie` en login)
- Normalización del payload JWT entre servicios
- Proxy WebSocket hacia el chat-service
- Stub del routes-service hasta su implementación completa

## Microservicios

| Servicio | Prefijo | Puerto |
|---|---|---|
| loggueo_service | `/api/auth` | 8000 |
| chat-service | `/api/chat` + WS | 3001 |
| routes-reservations-service | `/api/routes` | 4000 |

## Ramas

- `main` — código estable y desplegable
- `develop` — rama de integración
- `feature/*` — desarrollo de funcionalidades

## Stack

- Node.js 18 + NestJS
- TypeScript
- `http-proxy-middleware` para proxy HTTP
- `cookie-parser` para gestión de cookies
- `jsonwebtoken` para validación de JWT
