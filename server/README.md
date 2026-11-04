# API backend

API REST inicial basada en Express, Prisma y PostgreSQL.

## Configuración local

1. Copia `.env.example` a `.env` y configura PostgreSQL, una clave JWT aleatoria y las variables de seed.
2. Instala dependencias: `npm install`.
3. Genera el cliente Prisma: `npm run db:generate`.
4. Crea la migración inicial: `npx prisma migrate dev --name init`.
5. Crea el tenant y el usuario OWNER inicial: `npm run db:seed`.
6. Inicia la API: `npm run dev:api`.

La API escucha por defecto en el puerto 4000.

## Endpoints iniciales

- `GET /api/health`
- `POST /api/auth/login`
- `GET /api/me`
- `GET /api/dashboard/summary`
- `GET /api/customers`
- `POST /api/customers`
- `PATCH /api/customers/:id/status`
- `GET /api/plans`
- `POST /api/plans`
- `GET /api/invoices`
- `GET /api/equipment`

Todos los endpoints salvo health y login requieren JWT. Las consultas de negocio se limitan al tenant incluido en el token. No almacenar credenciales de OLT/routers en campos de texto ni exponerlas por API; la integración de red requiere un almacén de secretos y una capa de conectores aislada.


## Laboratorio FTTH (solo desarrollo)

Para habilitar el simulador en Codespaces/local, añade `GABOT_DEMO_MODE=true` al archivo `.env` y reinicia la API. El modo solo se monta cuando `NODE_ENV` no es `production`; no lo habilites en producción.

- Panel: menú **Operaciones FTTH → Laboratorio FTTH**.
- Crea/autoriza una ONU ficticia y crea una sesión PPPoE de prueba.
- En **Facturación, suspensión y reconexión (demo)**, simula un vencimiento para suspender esa sesión.
- Abre el enlace **Ver aviso cliente**: el portal solo presenta cuenta, plan, velocidad y estado; utiliza un token aleatorio y no revela DNI, correo, teléfono, dirección ni contraseña.
- Pulsa **Registrar pago demo** para marcar el pago ficticio y reactivar la sesión.

Los estados del laboratorio viven solo en memoria del proceso API: se pierden al reiniciar. No se crean facturas ni pagos en Neon, no se llama a SmartOLT/MikroTik y no se bloquea tráfico real. El portal público solo expone registros PPPoE ficticios creados en esta sesión.

Pruebas automatizadas: `npm test`. Compilación frontend: `npm run build`.
