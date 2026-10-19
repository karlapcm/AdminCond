# AdminCond — Día 18: Reservas de áreas comunes

## 1. Objetivo

Implementar un módulo de áreas comunes y reservas que permita administrar espacios compartidos, registrar reservas de residentes autorizados y evitar conflictos de horarios.

## 2. Arquitectura

El módulo `reservations` se desarrolló en Node.js y Express, separando responsabilidades en tres archivos:

- `reservation.routes.js`: endpoints HTTP protegidos mediante JWT.
- `reservation.service.js`: validaciones, fechas, duración y reglas de negocio.
- `reservation.repository.js`: consultas SQL parametrizadas y comprobaciones de permisos.

## 3. Base de datos

La migración `008_areas_reservas.sql` crea las tablas `admincond.areas_comunes` y `admincond.reservas_areas`.

Cada reserva se relaciona con un área, un condominio, una unidad y el usuario que la creó.

Se utiliza una restricción de exclusión GiST con `tstzrange` para impedir reservas confirmadas superpuestas, incluso ante operaciones concurrentes.

Las reservas canceladas permanecen registradas para conservar el historial.

## 4. Reglas de negocio

- Los administradores autorizados pueden registrar áreas comunes.
- Los residentes con relación activa con una unidad pueden realizar reservas.
- Las reservas deben comenzar en el futuro.
- La duración permitida está comprendida entre 30 minutos y 4 horas.
- No pueden existir dos reservas confirmadas con horarios superpuestos para una misma área.
- Una reserva futura puede ser cancelada por su titular o por un administrador autorizado.
- Los residentes pueden consultar horarios ocupados sin recibir los identificadores privados de reservas ajenas.

## 5. Endpoints

| Método | Endpoint | Descripción |
|---|---|---|
| POST | `/api/reservations/areas` | Registrar área común |
| GET | `/api/reservations/areas?condominioId=1` | Listar áreas activas |
| POST | `/api/reservations` | Confirmar reserva |
| GET | `/api/reservations?condominioId=1` | Consultar agenda |
| PATCH | `/api/reservations/:id/cancel` | Cancelar reserva |

## 6. Pruebas realizadas

- Creación de área común como Administrador C: `201 Created`.
- Listado de áreas comunes: `200 OK`.
- Reserva del Usuario A: `201 Created`.
- Intento de reserva superpuesta de Usuario B: `409 Conflict`.
- Consulta de agenda con datos de ocupación anónimos: `200 OK`.
- Cancelación por Usuario A: `200 OK`.
- Nueva reserva de Usuario B en horario liberado: `201 Created`.
- Intento de cancelación ajena por Usuario A: `404 Not Found`.

## 7. Pruebas finales pendientes de confirmación

- Consulta de áreas de otro cliente: `404 Not Found`.
- Consulta de reservas de otro cliente: `404 Not Found`.
- Creación de área común por residente: `404 Not Found`.
- Prueba automatizada de dos solicitudes de reserva simultáneas.

## 8. Consideraciones de seguridad

La autenticación y los permisos se comprueban en Express y PostgreSQL.

La restricción de exclusión previene conflictos de horarios en la base de datos.

Para fortalecer el sistema antes de producción, se deberá revisar la autorización frente a revocaciones concurrentes de membresías, implementar pruebas automatizadas de concurrencia y definir políticas operativas adicionales para cada área.
