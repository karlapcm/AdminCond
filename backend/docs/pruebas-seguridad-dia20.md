# AdminCond — Día 20: Pruebas automatizadas, seguridad y calidad del backend

**Proyecto:** AdminCond  
**Etapa:** Versión 1 (V1)  
**Tecnologías:** Node.js 24, Express 5, PostgreSQL 17, Docker Compose, JWT y `node:test`  
**Estado:** 23 pruebas automatizadas aprobadas, pendientes verificaciones finales de limpieza y versionado.

---

## 1. Objetivo

Implementar un entorno de testing independiente y una suite de pruebas automatizadas para validar los controles críticos del backend de AdminCond, especialmente la autenticación, autorización, integridad de las reservas y aislamiento entre condominios.

El propósito fue pasar de pruebas exclusivamente manuales a verificaciones reproducibles que permitan detectar errores o regresiones cuando se modifique el código o la base de datos.

## 2. Situación inicial

Antes de iniciar el Día 20, AdminCond contaba con una API REST desarrollada en Express y una base de datos PostgreSQL. Los módulos principales ya permitían gestionar usuarios, clientes, condominios, unidades residenciales, finanzas, comunicados y reservas.

Los endpoints habían sido probados manualmente, pero todavía no existía una suite automatizada que verificara los mecanismos de seguridad y las restricciones fundamentales del sistema.

El principal riesgo identificado era ejecutar pruebas que modificaran información de desarrollo o depender de comprobaciones manuales difíciles de repetir.

## 3. Diseño del entorno de testing

### 3.1. Separación de entornos

Se creó `compose.test.yaml` para disponer de infraestructura independiente:

| Componente | Desarrollo | Testing |
|---|---|---|
| API Express | Puerto 3000 | Puerto 3001 |
| PostgreSQL | Puerto 5433 | Puerto 5434 |
| Base de datos | `admincond_dev` | `admincond_test` |
| Servicio PostgreSQL | `postgres` | `postgres-test` |
| Servicio API | `api` | `api-test` |
| Credenciales | Desarrollo | Exclusivas de testing |
| JWT_SECRET | Desarrollo | Exclusivo de testing |

La instancia de testing utiliza su propio volumen Docker, evitando compartir los archivos de datos de PostgreSQL con el entorno de desarrollo.

**Decisión técnica:** Mantener separados los servicios, las bases de datos y las credenciales para reducir el riesgo de afectar registros reales del entorno de desarrollo.

**Evidencia:** La consulta `SELECT current_database(), current_user;` devolvió `admincond_test` y `postgres` durante la preparación inicial.

Posteriormente, la API TEST respondió correctamente a los endpoints `/api/health` y `/api/health/db`, y confirmó que utilizaba `DB_NAME=admincond_test` y `DB_USER=admincond_test_api`.

### 3.2. Separación de privilegios

Se mantuvieron los roles de PostgreSQL:

- `admincond_migrator`: propietario de las tablas y responsable de la estructura del esquema.
- `admincond_app`: rol que recibe permisos específicos para operar con los registros.
- `admincond_test_api`: usuario de conexión utilizado por la API TEST, con permisos heredados de `admincond_app`.

La aplicación no necesita privilegios administrativos para ejecutar sus operaciones habituales.

Esta separación aplica el **principio de mínimo privilegio**, porque limita las capacidades de la conexión utilizada por el backend.

### 3.3. Migraciones

Se ejecutaron las ocho migraciones existentes, desde `001_usuarios.sql` hasta `008_areas_reservas.sql`, sobre `admincond_test`.

Se comprobó que el esquema contenía **19 tablas**, todas propiedad de `admincond_migrator`.

También se verificó que `admincond_app` no tenía permiso para crear tablas ni eliminar registros de `reservas_areas`, aunque sí podía consultar los registros de reservas.

**Decisión técnica:** Reutilizar las migraciones originales para que el esquema de testing conserve las mismas restricciones y relaciones de la aplicación.

## 4. Herramientas y estructura de pruebas

Se utilizó `node:test`, la herramienta integrada de pruebas de Node.js, junto con `assert` y `fetch`.

La suite quedó organizada en los siguientes archivos:

| Archivo | Responsabilidad |
|---|---|
| `tests/database.test.js` | Estructura de PostgreSQL, propiedad de tablas, privilegios y restricción GiST |
| `tests/concurrency.test.js` | Inserciones concurrentes de reservas |
| `tests/api.test.js` | Rutas HTTP, autenticación obligatoria y solicitudes inválidas |
| `tests/auth-sessions.test.js` | JWT con sesión activa y revocada |
| `tests/authorization.test.js` | Permisos por rol y aislamiento entre condominios |

El comando general de ejecución es:

```bash
npm test
```

Las pruebas se implementaron sin incorporar un framework de testing externo.

## 5. Mejora arquitectónica de Express

Originalmente, `src/app.js` configuraba Express e iniciaba el servidor HTTP en el mismo archivo.

Para facilitar las pruebas, se separaron las responsabilidades:

**`src/http-app.js`**

Contiene la configuración de Express, middlewares, rutas, endpoints de salud y manejo centralizado de errores. Exporta la instancia de la aplicación.

**`src/app.js`**

Importa la aplicación y ejecuta `app.listen()` para iniciar el servidor.

Esta modificación permite realizar pruebas HTTP utilizando un servidor temporal con un puerto asignado automáticamente, sin ocupar el puerto de desarrollo.

Se mantuvieron las rutas existentes y se comprobó que la API continuaba funcionando después de reiniciar el contenedor.

**Evidencia:** `GET /api/health` respondió:

```json
{
  "status": "ok",
  "service": "admincond-api"
}
```

## 6. Pruebas automatizadas realizadas

### 6.1. Estructura y privilegios de PostgreSQL

| Código | Prueba | Resultado |
|---|---|---|
| D20-01 | Verificar conexión a `admincond_test` | PASS |
| D20-02 | Comprobar existencia de 19 tablas | PASS |
| D20-03 | Verificar propiedad de tablas por `admincond_migrator` | PASS |
| D20-04 | Comprobar ausencia de permiso `CREATE` para `admincond_app` | PASS |
| D20-05 | Comprobar permiso `SELECT` sobre reservas | PASS |
| D20-06 | Comprobar ausencia de permiso `DELETE` sobre reservas | PASS |
| D20-07 | Verificar existencia de restricción de exclusión GiST | PASS |

Estas pruebas ayudan a detectar configuraciones incorrectas después de aplicar migraciones o modificar privilegios.

### 6.2. Concurrencia de reservas

**Prueba D20-08: PASS**

Se simularon dos operaciones concurrentes intentando confirmar reservas para la misma área y un horario idéntico.

La prueba creó usuarios, unidades, un condominio y un área temporal en PostgreSQL TEST. Posteriormente, inició dos inserciones mediante conexiones independientes y mantuvo abierta una transacción brevemente para provocar competencia entre ambas.

**Resultados comprobados:**

- Una operación fue aceptada.
- La segunda operación fue rechazada por la restricción de exclusión.
- PostgreSQL almacenó únicamente una reserva confirmada.

La restricción utilizada es:

```sql
EXCLUDE USING gist (
    area_id WITH =,
    tstzrange(inicio, fin, '[)') WITH &&
)
WHERE (estado = 'confirmada')
```

**Importancia:** Esta protección reduce el riesgo de reservas duplicadas producido por condiciones de carrera.

La validación se realiza en PostgreSQL, incluso si ambas solicitudes llegan antes de que una validación previa de disponibilidad pueda detectar el conflicto.

### 6.3. Pruebas HTTP y autenticación obligatoria

| Código | Prueba | Resultado |
|---|---|---|
| D20-09 | API responde correctamente | PASS |
| D20-10 | `/api/auth/me` rechaza solicitudes sin JWT | PASS |
| D20-11 | Consulta de áreas exige autenticación | PASS |
| D20-12 | Creación de áreas sin JWT rechazada | PASS |
| D20-13 | Creación de reservas sin JWT rechazada | PASS |
| D20-14 | Cancelación de reservas sin JWT rechazada | PASS |
| D20-15 | JSON malformado devuelve HTTP 400 | PASS |
| D20-16 | Ruta inexistente devuelve HTTP 404 | PASS |
| D20-17 | Token JWT malformado rechazado | PASS |
| D20-18 | Esquema de autenticación distinto de Bearer rechazado | PASS |

Estas pruebas utilizan solicitudes HTTP reales contra una instancia temporal de Express.

La aparición del mensaje de error sobre JSON inválido durante D20-15 es esperada, porque el escenario comprueba deliberadamente el manejo de solicitudes malformadas.

### 6.4. Revocación de sesiones JWT

**Prueba D20-19: PASS**

Se creó un usuario temporal y una sesión válida dentro de `admincond_test`. Después, se generó un JWT utilizando los mismos parámetros criptográficos y de validación empleados por AdminCond.

Se comprobó el siguiente comportamiento:

| Estado de sesión | Respuesta |
|---|---|
| Activa y JWT válido | `200 OK` |
| Revocada y mismo JWT | `401 Unauthorized` |

**Decisión de seguridad:** No confiar únicamente en la firma y expiración del JWT.

El middleware también comprueba el identificador de sesión (`sid`) en PostgreSQL, validando que la sesión no esté revocada ni expirada y que el usuario permanezca activo.

**Riesgo controlado:** Continuar utilizando un token después de revocar la sesión correspondiente.

### 6.5. Autorización por roles y aislamiento entre clientes

Se crearon usuarios y recursos sintéticos pertenecientes a diferentes condominios para probar permisos mediante la API TEST.

| Código | Escenario | Resultado |
|---|---|---|
| D20-20 | Residente intenta registrar un área común | PASS — 404 |
| D20-21 | Usuario externo intenta consultar áreas de otro condominio | PASS — 404 |
| D20-22 | Residente intenta cancelar una reserva ajena | PASS — 404 |
| D20-23 | Administrador autorizado registra un área | PASS — 201 |

Los códigos `404` de las operaciones no autorizadas responden al diseño de la API, que evita revelar la existencia de recursos privados.

Estas pruebas verifican que disponer de un JWT válido no implica contar automáticamente con autorización para operar sobre cualquier condominio.

## 7. Resultados finales

**Ejecución:** `npm test`

| Categoría | Cantidad | Resultado |
|---|---:|---|
| PostgreSQL: esquema y privilegios | 7 | PASS |
| Concurrencia de reservas | 1 | PASS |
| Rutas HTTP y validaciones | 10 | PASS |
| Revocación JWT | 1 | PASS |
| Autorización e aislamiento | 4 | PASS |
| **Total** | **23** | **PASS** |

**Resumen reportado por Node.js:**

```text
tests 23
pass 23
fail 0
cancelled 0
skipped 0
duration_ms 5086.0649
```

Las 23 pruebas terminaron correctamente, sin fallos registrados durante la ejecución de la suite completa.

## 8. Gestión de datos temporales

Las pruebas con operaciones de escritura utilizan identificadores aleatorios para diferenciar sus datos de los demás registros.

Se implementaron procedimientos de limpieza mediante `finally` y funciones ejecutadas al terminar los tests.

Durante la implementación se detectó que una ejecución fallida inicial de la prueba JWT dejó un usuario temporal en la base de testing. Este caso permitió identificar la necesidad de reforzar la verificación de limpieza después de una ejecución incompleta.

**Estado:** Se identificó el registro temporal y se preparó su eliminación específica. La verificación final de ausencia de datos residuales continúa pendiente de confirmación.

## 9. Hallazgos técnicos

**Hallazgo 1 — La integridad no debe depender solamente de Express.**

La prueba concurrente confirmó que una restricción en PostgreSQL puede proteger una regla crítica de negocio cuando ocurren múltiples operaciones simultáneas.

**Hallazgo 2 — El JWT necesita controles del lado del servidor.**

La revocación de sesiones permite impedir el uso de determinados tokens antes de su expiración.

**Hallazgo 3 — Autenticación y autorización son controles diferentes.**

Un usuario puede tener una sesión válida y, aun así, no estar autorizado para gestionar áreas ni acceder a otros condominios.

**Hallazgo 4 — Los entornos de pruebas deben estar aislados.**

La separación de base de datos, puertos, credenciales y secreto JWT permite ejecutar pruebas sin depender directamente de los registros utilizados durante el desarrollo.

**Hallazgo 5 — Las pruebas deben ser reproducibles.**

Es necesario comprobar tanto los resultados esperados como la limpieza de los datos temporales y la capacidad de volver a ejecutar la suite.

## 10. Limitaciones y trabajo pendiente

Aunque las 23 pruebas fueron aprobadas, no representan una auditoría completa de seguridad.

Se identificaron las siguientes mejoras pendientes:

- Automatizar pruebas de permisos financieros.
- Verificar revocaciones de membresías durante operaciones concurrentes.
- Ampliar las pruebas de validación de datos y respuestas de error.
- Comprobar automáticamente la eliminación completa de fixtures.
- Ejecutar la suite mediante un proceso de integración continua (CI/CD).
- Revisar posibles condiciones de carrera en otras operaciones sensibles.
- Evaluar las pruebas de integración utilizando diferentes escenarios de usuarios y condominios.

## 11. Conclusiones

1. Aprendí que probar un backend no consiste únicamente en verificar respuestas exitosas. También es necesario demostrar que el sistema rechaza operaciones inválidas y no autorizadas.

2. Comprobé que PostgreSQL puede garantizar reglas importantes de integridad, como impedir reservas superpuestas, incluso cuando varias operaciones intentan ejecutarse simultáneamente.

3. Entendí mejor la diferencia entre autenticación y autorización, porque un JWT válido identifica una sesión, pero no concede permisos automáticos sobre todos los recursos del sistema.

4. Implementar una base de datos exclusiva para pruebas me permitió trabajar con mayor seguridad y construir escenarios reproducibles sin depender de la información de desarrollo.

5. Considero que esta suite es una mejora importante para AdminCond, porque ahora cuento con evidencias automatizadas que puedo presentar y explicar técnicamente, además de las funcionalidades desarrolladas en React y Express.

---

**Estado final del desarrollo del Día 20:** 23 pruebas automatizadas aprobadas.