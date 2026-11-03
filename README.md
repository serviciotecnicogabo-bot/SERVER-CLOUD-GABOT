# GABOT CLOUD FTTH

Plataforma web para la administración de operadores de internet por fibra óptica (FTTH).

## Estado actual

**Fundación técnica inicial en desarrollo.** Incluye una interfaz React/Vite y una API REST inicial con Express, Prisma y PostgreSQL.

### Interfaz
- Panel administrativo adaptable a escritorio y celular.
- Módulos visuales para clientes, planes, servicios, OLT, ONU/ONT, incidencias, técnicos, facturación, pagos, deudas, inventario y reportes.
- Directorio de clientes de demostración con búsqueda y alta temporal en memoria.

### Backend inicial
- Modelo multiempresa (tenant) en PostgreSQL.
- Usuarios y roles (OWNER, ADMIN, BILLING, SUPPORT, TECHNICIAN, CUSTOMER).
- Clientes, planes, servicios, facturas, pagos, equipos de red y auditoría.
- Inicio de sesión con JWT y contraseñas con hash bcrypt.
- Endpoints iniciales para clientes, planes, facturas, equipos y resumen.
- Separación de datos por empresa en las consultas de negocio.

## Ejecutar en GitHub Codespaces

Requisitos: Node.js 20 o superior y una base PostgreSQL accesible.

1. Abre el repositorio en Codespaces.
2. En la terminal ejecuta:

```bash
npm install
cp .env.example .env
```

3. Edita `.env` y configura `DATABASE_URL`, `JWT_SECRET` y las variables `SEED_*`. No compartas ni subas el archivo `.env`.
4. Genera el cliente y crea las tablas:

```bash
npm run db:generate
npx prisma migrate dev --name init
npm run db:seed
```

5. Abre una segunda terminal e inicia la API:

```bash
npm run dev:api
```

6. En otra terminal inicia la interfaz:

```bash
npm run dev
```

Abre el puerto 5173 desde la pestaña Ports de Codespaces. Las llamadas `/api` se redirigen al puerto 4000.

## Variables de entorno

Consulta `.env.example`. Usa una base de datos de desarrollo y contraseñas únicas. El usuario inicial se crea únicamente cuando ejecutas el seed.

## API
- `GET /api/health` (público)
- `POST /api/auth/login` (público)
- `GET /api/me`
- `GET /api/dashboard/summary`
- `GET /api/customers`
- `POST /api/customers`
- `PATCH /api/customers/:id/status`
- `GET /api/plans`
- `POST /api/plans`
- `GET /api/invoices`
- `GET /api/equipment`

## Importante: límites de esta etapa

Los datos que muestra actualmente el panel web siguen siendo demostrativos; el frontend todavía no está conectado al inicio de sesión ni a la API. El backend y el esquema están preparados como base, pero requieren configurar PostgreSQL, ejecutar la migración y probar el flujo de extremo a extremo.

No hay todavía integración real con OLT Huawei/ZTE/VSOL, suspensión automática, facturación electrónica, pasarela de pagos ni portal de cliente listo para producción. Las integraciones de red requieren pruebas en laboratorio, permisos mínimos y almacenamiento seguro de secretos.

## Siguientes etapas
1. Conectar la interfaz con login y API.
2. Completar CRUD y reglas de negocio para clientes, planes, servicios y facturación.
3. Añadir pruebas automatizadas y migraciones controladas.
4. Desarrollar adaptadores de red Huawei, ZTE y VSOL.
5. Implementar portal de cliente, despliegue VPS, copias de seguridad y monitoreo.
