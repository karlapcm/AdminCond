
# AdminCond V1 — Día 34
## Recuperación segura de invitaciones interrumpidas

### 1. Objetivo

Fortalecer el flujo de entrega de invitaciones cuando
ocurren interrupciones del servidor o resultados de
entrega inciertos.

La solución mantiene la arquitectura de monolito
modular y utiliza PostgreSQL para controlar los estados.

### 2. Problema identificado

El flujo original reclamaba una invitación cambiando
su estado de entrega de `pendiente` a `enviando`.

Si el servidor se interrumpía antes de registrar el
resultado, la invitación podía permanecer en `enviando`
indefinidamente.

Además, una recuperación podía interrumpirse después
de rotar el token, dejando una invitación `pendiente`
con un token que ya no estaba disponible en memoria.

### 3. Cambios implementados

#### Migración 011

Archivo: `backend/sql/011_inicio_envio_invitaciones.sql`

Agrega `inicio_envio_en` para registrar el momento
en que una invitación es reclamada para su entrega.

La actualización del estado y de la fecha se realiza
mediante una única operación SQL.

#### Migración 012

Archivo:
`backend/sql/012_seguimiento_recuperacion_invitaciones.sql`

Agrega `recuperacion_iniciada_en` para identificar
recuperaciones administrativas que podrían quedar
incompletas.

No se almacenan tokens originales ni credenciales.

#### Diagnóstico administrativo

Endpoint:

GET /api/invitations/delivery/incidents

Permite detectar:
- Entregas antiguas con estado `enviando`.
- Entregas heredadas sin fecha de inicio.
- Recuperaciones antiguas que permanecen `pendiente`.

Se utiliza un umbral inicial de 30 minutos.

La consulta está restringida a administradores con
membresías activas en los condominios correspondientes.

No realiza modificaciones ni reenvíos automáticos.

#### Recuperación administrativa

Endpoint:

POST /api/invitations/delivery/:id/recover

Requiere:
- Autenticación.
- Autorización administrativa vigente.
- Una incidencia elegible según su estado y antigüedad.
- Confirmación explícita:
  `confirmarInvalidacionToken: true`.

La recuperación:
- Genera un token nuevo.
- Almacena únicamente su hash SHA-256.
- Invalida el token anterior.
- Registra el momento de recuperación.
- Restablece la entrega a `pendiente`.
- Impide recuperaciones simultáneas exitosas
  sobre una misma invitación.

En producción, el token no se devuelve al navegador.
Se utiliza únicamente para intentar su entrega.

### 4. Reglas de seguridad

- Aislamiento estricto entre condominios.
- Validación de membresías administrativas activas.
- Sin reenvíos automáticos de entregas inciertas.
- Confirmación explícita antes de invalidar tokens.
- Un solo cambio de estado exitoso por recuperación
  concurrente sobre la misma invitación.
- Sin exposición de tokens ni hashes mediante
  los endpoints de diagnóstico.
- Sin modificación de la invitación cuando el
  servicio de correo no está configurado.

### 5. Pruebas automatizadas

Se incorporaron las pruebas D34-01 a D34-13.

Cobertura destacada:
- Bloqueo de reemisiones inseguras.
- Registro de inicio de entrega.
- Detección de entregas interrumpidas.
- Aislamiento del diagnóstico por administrador.
- Compatibilidad con invitaciones heredadas.
- Recuperación autorizada y rotación de tokens.
- Confirmación obligatoria mediante API.
- Rechazo cuando SMTP no está configurado.
- Flujo con transporte de correo simulado.
- Detección de recuperaciones incompletas.
- Recuperación posterior de estados pendientes.
- Protección ante recuperaciones concurrentes.

Resultado local comunicado: 88/88 pruebas aprobadas.

### 6. Limitaciones conocidas

- El transporte jsonTransport de Nodemailer no
  demuestra la recepción real de un correo.
- SMTP puede aceptar un mensaje sin garantizar
  que llegue al destinatario.
- Una recuperación invalida el token anterior,
  incluso si el destinatario lo recibió.
- El umbral de 30 minutos es una política inicial,
  no una prueba de fallo del servidor.
- No existe todavía una interfaz React dedicada
  para consultar o recuperar incidencias.
- El contador intentos_entrega conserva el historial
  acumulado de intentos registrados.
- El sistema no dispone de una cola persistente
  de envío ni de reintentos automáticos.
- Se requiere evaluar el comportamiento de envío
  real y recuperación ante interrupciones en
  un entorno de despliegue controlado.

### 7. Decisiones de arquitectura

Se conserva:
- Monolito modular.
- PostgreSQL como fuente de verdad.
- Autorización en backend y consultas SQL.
- Principio de menor privilegio.
- Rotación segura de tokens.
- Separación DEV / TEST.
- Sin microservicios ni infraestructura adicional
  para este alcance V1.