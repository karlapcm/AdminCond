# AdminCond — Día 16: Módulo de comunicados

## 1. Objetivo

Implementar un módulo de comunicados que permita a los administradores publicar avisos dirigidos a los residentes de un condominio, aplicando autenticación, autorización y aislamiento entre clientes.

## 2. Arquitectura implementada

Se desarrolló el módulo `communications` dentro del backend Node.js y Express, utilizando PostgreSQL como base de datos.

El módulo está organizado en tres capas:

- `communication.routes.js`: define los endpoints HTTP y exige autenticación.
- `communication.service.js`: valida los datos recibidos y aplica las reglas de negocio.
- `communication.repository.js`: ejecuta las consultas SQL parametrizadas y verifica las membresías correspondientes.

## 3. Base de datos

Se creó la migración `007_comunicados.sql`, que incorpora la tabla `admincond.comunicados`.

Cada comunicado registra su cliente, condominio, autor, título, contenido, estado y fecha de creación.

La clave foránea compuesta `(condominio_id, cliente_id)` garantiza que el condominio indicado pertenezca al cliente correspondiente.

## 4. Endpoints implementados

| Método | Endpoint | Descripción |
|---|---|---|
| POST | `/api/communications` | Publicar comunicado |
| GET | `/api/communications?condominioId=1` | Listar comunicados del condominio |
| GET | `/api/communications/:id` | Consultar el detalle de un comunicado |

## 5. Reglas de seguridad

- Todos los endpoints requieren autenticación JWT.
- Solo los administradores con membresías activas pueden publicar comunicados.
- Los usuarios autorizados pueden consultar los comunicados de sus condominios.
- Los identificadores y campos de texto se validan antes de ejecutar operaciones.
- Las consultas SQL utilizan parámetros para evitar concatenación insegura.
- Los recursos de otros condominios o clientes no se exponen a usuarios no autorizados.
- Los comunicados incluyen el identificador de su autor para mantener trazabilidad.

## 6. Pruebas funcionales y de seguridad

Se verificaron los siguientes escenarios:

- Publicación exitosa como Administrador C: `201 Created`.
- Lectura como Usuario A: `200 OK`.
- Lectura como Usuario B: `200 OK`.
- Lectura como Usuario D: `200 OK`.
- Intento de publicación como residente: `404 Not Found`.
- Intento de consultar comunicados de otro cliente: `404 Not Found`.

**Prueba adicional pendiente de registrar:** consulta del detalle por ID con usuario autorizado y usuario de otro cliente.

## 7. Resultado

El módulo permite administrar comunicados a nivel de condominio y aplica restricciones de acceso desde el backend, independientemente de la interfaz utilizada.

La interfaz de usuario en React se desarrollará en una etapa posterior.