# Integración de red: MikroTik y SmartOLT

## Alcance de esta primera entrega

- Guarda de forma cifrada las credenciales de conexión por empresa.
- Prueba la API REST de MikroTik RouterOS v7 mediante HTTPS.
- Prueba el token de SmartOLT mediante el encabezado `X-Token`.
- Consulta las ONUs detectadas y todavía no autorizadas en SmartOLT.
- No crea, modifica, suspende ni elimina cuentas PPPoE u ONUs en esta etapa. Las acciones de aprovisionamiento se habilitarán después de verificar los perfiles, zonas, VLAN reales y parámetros de la OLT.

## Preparar Neon

Esta rama añade el modelo `IntegrationConfig`. Después de actualizar el código, ejecuta primero:

```bash
npx prisma db push
npx prisma generate
```

La operación agrega la tabla de configuración de integraciones. No uses `prisma migrate reset`, porque borraría los datos de la base de datos.

## Preparar cifrado

Genera una clave aleatoria en la terminal del Codespace:

```bash
openssl rand -hex 32
```

Guarda el resultado como variable de entorno `INTEGRATION_ENCRYPTION_KEY` en los secretos del Codespace o en el entorno privado donde se ejecuta la API. No la escribas en el repositorio, no la compartas por chat y conserva una copia segura: sin esa clave no podrán descifrarse las credenciales guardadas.

Reinicia el proceso de la API después de agregar la variable.

## MikroTik

- Requiere RouterOS v7 con REST habilitado.
- Usa una URL HTTPS accesible desde el servidor GABOT, idealmente por VPN o red privada.
- El certificado TLS debe ser válido; no se desactiva la validación TLS.
- Crea en MikroTik un usuario de API dedicado con permisos mínimos para las operaciones necesarias.

La prueba consulta `/rest/system/resource`. Esta entrega no crea secretos PPP todavía.

## SmartOLT

- Usa el dominio asignado a la cuenta, por ejemplo `https://empresa.smartolt.com`.
- Crea/activa el API Token en SmartOLT y permite la IP pública de salida del servidor GABOT.
- La prueba consulta `/api/system/get_olts`.
- La búsqueda de ONUs pendientes consulta `/api/onu/unconfigured_onus`.

La autorización de una ONU es una operación real de red. Antes de habilitarla en GABOT hay que confirmar OLT, PON, tarjeta, puerto, número de serie, tipo de ONU, perfiles ópticos, modo bridge/routing, VLAN real y zona. El código comercial al final del usuario PPPoE (por ejemplo `-150`) identifica el plan y nunca se tratará como VLAN real.

## Lista de destinos autorizados

Antes de guardar una URL de equipo, añade su autoridad HTTPS exacta (host y, solo si es distinto del puerto HTTPS estándar, puerto) a una variable privada del servidor:
- `MIKROTIK_ALLOWED_HOSTS=router.vpn.empresa`
- `SMARTOLT_ALLOWED_HOSTS=cuenta.smartolt.com`

Si se usan varios destinos, sepáralos con comas. No incluyas `https://` ni `:443` en estas variables; añade el puerto solo si no es el 443 estándar. La aplicación rechaza destinos que no estén en la lista y no sigue redirecciones HTTP. Mantén las listas vacías hasta que el administrador confirme los hosts de laboratorio autorizados. No uses comodines.

## Seguridad y operación

- Los secretos se cifran con AES-256-GCM antes de guardarse en Neon.
- La API nunca devuelve los secretos al navegador.
- Solo OWNER y ADMIN pueden guardar configuración o ejecutar pruebas.
- No compartas tokens, claves, contraseñas PPPoE ni archivos `.env`.
