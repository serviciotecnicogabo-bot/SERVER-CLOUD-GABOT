# GABOT CLOUD FTTH

Plataforma web para la administración de operadores de internet por fibra óptica (FTTH).

## Primera versión

- Panel administrativo adaptable a escritorio y celular.
- Navegación por módulos: clientes, planes, servicios, red/OLT, ONU/ONT, incidencias, técnicos, facturación, pagos, deudas, inventario, reportes y configuración.
- Directorio de clientes de demostración con búsqueda y alta local.
- Indicadores y actividad de ejemplo para mostrar la interfaz.

## Requisitos

- Node.js 20 o superior (recomendado).
- npm.

## Ejecutar en Codespaces

```bash
npm install
npm run dev
```

Abre el puerto que indique Vite (por defecto 5173).

## Compilar

```bash
npm run build
```

## Estado y limitaciones

Esta es una primera interfaz funcional de demostración. Los datos mostrados son ficticios y el alta de clientes se mantiene en memoria del navegador; todavía no existe persistencia, autenticación real, facturación electrónica, cobros reales ni conexión con OLT/routers. No introducir datos personales reales ni credenciales de equipos hasta implementar backend, base de datos, controles de acceso y auditoría.

## Próximas etapas

1. Backend y base de datos PostgreSQL.
2. Autenticación, roles y separación por empresa.
3. Clientes, contratos, planes, cargos recurrentes, pagos y deuda persistentes.
4. Integraciones de red con Huawei, ZTE y VSOL mediante adaptadores seguros y pruebas en laboratorio.
5. Portal de clientes, despliegue VPS, copias de seguridad y monitoreo.
