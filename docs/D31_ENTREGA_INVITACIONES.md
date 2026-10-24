
# AdminCond V1 — Día 31
## Entrega segura de invitaciones

### Objetivo

Implementar un mecanismo configurable para entregar invitaciones
de residentes, registrar los resultados de envío y permitir
reemisiones administrativas controladas.

### Funcionalidad implementada

- Solicitud de incorporación por responsable principal activo.
- Aprobación y rechazo por administrador autorizado.
- Generación de tokens aleatorios de uso único.
- Almacenamiento exclusivo del hash SHA-256 del token.
- Vigencia de invitaciones de 48 horas.
- Aceptación restringida a la cuenta destinataria.
- Transporte de correo SMTP configurable con Nodemailer.
- Seguimiento de estado e intentos de envío.
- Reclamo atómico en PostgreSQL antes de intentar enviar.
- Reemisión administrativa cuando la entrega figura como fallida.
- Invalidación del token anterior durante la reemisión.

### Estados independientes

La invitación puede estar pendiente, utilizada o revocada.

La entrega puede estar pendiente, enviando, enviada o fallida.

Un correo aceptado por el transporte no significa que la
invitación haya sido aceptada por el residente.

### Seguridad

- Las respuestas HTTP fuera del laboratorio no incluyen el token.
- No se guardan tokens originales en PostgreSQL.
- Los permisos administrativos se verifican en el backend.
- Las operaciones de reemisión requieren autorización.
- Los tokens utilizados no pueden reutilizarse.
- Los intentos simultáneos de reclamo están controlados.
- No se almacenan credenciales SMTP en el repositorio.

### Migraciones

009_entrega_invitaciones.sql:
agrega seguimiento de entrega e intentos.

010_control_entrega_invitaciones.sql:
permite el estado intermedio enviando.

Ambas migraciones fueron verificadas en TEST y DEV.

### Pruebas

69 pruebas automatizadas aprobadas localmente.

Se verificaron:
- Solicitud, aprobación y aceptación.
- Rechazo de usuarios no autorizados.
- Protección e invalidación de tokens.
- Reemisión administrativa.
- Reclamos concurrentes con PostgreSQL.
- Procesamiento HTTP con transporte de correo simulado.
- Comportamiento cuando SMTP no está configurado.

### Limitaciones conocidas

- No se ha verificado la entrega mediante un servidor SMTP real.
- El transporte simulado no entrega mensajes externos.
- Una interrupción durante un envío puede dejar un resultado
  incierto en estado enviando.
- No existe recuperación automática de estos estados inciertos.
- Los errores de conexión SMTP no siempre permiten determinar
  si el servidor aceptó el mensaje.
- La reemisión está disponible mediante API, pero no tiene
  todavía una interfaz administrativa específica en React.
- No se garantiza entrega exactamente una vez entre SMTP
  y PostgreSQL.

### Decisiones de arquitectura

Se mantiene el monolito modular de AdminCond V1.

La entrega de invitaciones está separada de la lógica de negocio
y de las transacciones SQL.

No se incorporaron Redis, colas externas ni microservicios.