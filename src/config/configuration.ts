export default () => ({
  port: parseInt(process.env.PORT || '8080', 10),

  jwt: {
    secret: process.env.JWT_SECRET || 'dev_secret_change_me',
  },

  services: {
    auth: process.env.AUTH_SERVICE_URL || 'http://localhost:8000',
    chat: process.env.CHAT_SERVICE_URL || 'http://localhost:3001',
    // Vacío = routes-service no está listo, el gateway responde con stub 503
    routes: process.env.ROUTES_SERVICE_URL || '',
  },

  cookie: {
    name: 'access_token',
    maxAge: parseInt(process.env.COOKIE_MAX_AGE || '1800', 10),
  },

  frontend: {
    url: process.env.FRONTEND_URL || 'http://localhost:5173',
  },
});
