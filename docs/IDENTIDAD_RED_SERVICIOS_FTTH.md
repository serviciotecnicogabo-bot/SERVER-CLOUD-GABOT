# Identidad de red por servicio FTTH

Esta etapa vincula los datos de acceso y planta externa a cada suscripción sin ejecutar aprovisionamiento en equipos.

## Campos en Subscription

- `pppoeUsername`: identificador PPPoE único, normalizado a minúsculas y validado con el formato `NNcalle123-PPP`.
- `zone`, `streetName`, `streetNumber`: ubicación lógica del abonado.
- `vlanId`: VLAN real (1–4094), independiente del código comercial del plan.
- `onuSerial`, `oltName`, `ponPort`: identificación de ONT/ONU y puerto PON.

Los campos son opcionales para no romper las suscripciones existentes. La contraseña PPPoE no se almacena en este modelo ni se devuelve por la API.

## API

`PATCH /api/subscriptions/:id/network`

Requiere JWT y rol OWNER, ADMIN, SUPPORT o TECHNICIAN. Solo actualiza una suscripción perteneciente al tenant autenticado. Acepta uno o más campos de identidad de red; rechaza propiedades desconocidas. Los cambios generan un AuditLog con los nombres de campos, nunca con credenciales.

Ejemplo de cuerpo:

```json
{
  "pppoeUsername": "23huallaga789-150",
  "zone": "23",
  "streetName": "huallaga",
  "streetNumber": "789",
  "vlanId": 120,
  "onuSerial": "HWTC-DEMO-001",
  "oltName": "OLT-DEMO-01",
  "ponPort": "0/1/1"
}
```

El ejemplo es ilustrativo: VLAN 120 no se deriva del sufijo 150. Confirma la VLAN asignada por zona antes de registrar datos reales.

## Aplicación de cambios de esquema

En el entorno de desarrollo, después de actualizar la rama:

```bash
npx prisma db push
npx prisma generate
```

Esto actualiza el esquema de Neon conectado a `DATABASE_URL`. Ejecutarlo solo en la base de desarrollo prevista. No ejecuta acciones en MikroTik ni SmartOLT.
