# Laboratorio DEMO FTTH

Ruta: `/demo/` cuando el servidor Vite esté ejecutándose.

## Aislamiento y seguridad
- Página estática autocontenida en `public/demo/index.html`.
- No realiza solicitudes HTTP, no importa el cliente de API y no accede a Neon/Prisma.
- No contacta SmartOLT ni MikroTik y no ejecuta operaciones reales.
- Los datos viven únicamente en memoria de la pestaña; al recargar o pulsar Reiniciar se descartan.
- Usar únicamente datos ficticios. Nunca introducir contraseñas, seriales o datos de abonados reales.

## Casos de prueba manuales
1. Simular autorización de cada ONU ficticia y verificar estado DEMO.
2. Intentar autorizar la misma ONU dos veces: debe avisar que ya fue autorizada.
3. Validar VLAN fuera del rango 1–4094: debe rechazarla.
4. Crear usuarios PPPoE con planes 100, 150 y 200.
5. Confirmar formato: interior + calle minúscula sin espacios + número + guion + código comercial.
6. Repetir un usuario: debe impedir duplicado.
7. Reiniciar y confirmar que los registros temporales desaparecen.

## Retirada
Para retirar el simulador, eliminar `public/demo/index.html` y este documento. No requiere migraciones ni limpieza de base de datos, porque no crea tablas ni registros persistentes.
