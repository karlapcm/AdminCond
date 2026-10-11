# AdminCond — Matriz de roles y permisos (V1)

**Estado:** diseño inicial aprobado para implementación progresiva  
**Día de trabajo:** Día 2 — Autorización y seguridad  
**Stack previsto:** React, Node.js/Express, PostgreSQL

## 1. Objetivo

Definir qué operaciones puede realizar cada usuario, **sobre qué cliente, condominio, unidad o documento**, y cómo debe comprobarlo el backend. Este documento es una especificación de diseño; **no certifica que los controles ya estén implementados**.

## 2. Conceptos que no deben confundirse

- **Cliente:** empresa administradora o particular que contrata AdminCond.
- **Supercliente:** usuario con facultad de supervisar condominios asociados a un cliente específico. Puede recibir permisos operativos adicionales explícitos.
- **Administrador:** usuario autorizado para operar uno o más condominios asignados. Puede tener permisos financieros distintos de los administrativos generales.
- **Responsable principal de unidad:** persona designada para gestionar la unidad; hay como máximo uno **activo** por unidad.
- **Responsable de pago:** persona designada para atender obligaciones económicas; puede coincidir o no con el responsable principal o propietario.
- **Residente adicional:** ocupante con cuenta independiente y acceso limitado.
- **Propietario / inquilino / ocupante:** relaciones de una persona con una unidad; **no son automáticamente permisos globales**.
- **Visitante:** persona sin cuenta que consulta información explícitamente pública.

Una persona puede tener distintos roles en distintos condominios. Los permisos se evalúan **en el contexto del recurso**.

## 3. Leyenda

- **S:** sí, únicamente dentro del ámbito autorizado.
- **P:** permiso adicional y explícito por condominio y operación.
- **C:** condicionado a vínculo vigente con la unidad o autorización de acceso específica.
- **—:** denegado por defecto.

**Regla general:** si no hay un permiso válido, se deniega la acción; el frontend nunca reemplaza la verificación del backend.

## 4. Matriz funcional V1

| Acción | Super Admin | Supercliente | Administrador | Responsable principal | Residente adicional | Visitante |
|---|:---:|:---:|:---:|:---:|:---:|:---:|
| Ver publicaciones públicas | S | S | S | S | S | S |
| Enviar solicitud de afiliación | S | S | S | S | S | S |
| Revisar y aprobar afiliaciones | S | — | — | — | — | — |
| Administrar clientes / estado de suscripción | S | — | — | — | — | — |
| Ver panel agregado de sus condominios | — | S | P | — | — | — |
| Asignar administradores de sus condominios | — | S | P | — | — | — |
| Crear o modificar edificios y unidades | — | P | S | — | — | — |
| Registrar vínculos propietario / inquilino / ocupante | — | P | S | — | — | — |
| Designar o cambiar responsable principal / de pago | — | P | S | — | — | — |
| Solicitar incorporación de residente adicional | — | — | — | S | — | — |
| Aprobar solicitudes e invitar residentes | — | P | S | — | — | — |
| Ver comunicados y juntas de su condominio | — | S | S | C | C | — |
| Publicar comunicados y convocar juntas | — | P | S | — | — | — |
| Ver áreas comunes, reglas y cierres | — | S | S | C | C | — |
| Configurar áreas comunes y cierres temporales | — | P | S | — | — | — |
| Generar / ajustar cuotas | — | P | P | — | — | — |
| Ver cuotas y recibos de una unidad | — | P | P | C | C* | — |
| Registrar pago manual y adjuntar comprobante | — | P | P | C | C* | — |
| Aprobar o rechazar un pago | — | P | P | — | — | — |
| Ver documentos privados de una unidad | — | P | P | C | C* | — |
| Publicar documentos internos autorizados | — | P | S | — | — | — |
| Consultar auditoría operativa de su ámbito | P** | P | P | — | — | — |

\* **Residente adicional:** denegado inicialmente para información financiera y documentos privados; solo se activa con autorización explícita y alcance limitado.  
\*\* **Super Admin:** acceso administrativo a eventos de plataforma, pero **no** lectura automática de datos financieros o documentos privados de clientes. Acceso de soporte excepcional requiere proceso específico y auditoría.

**Nota:** la facultad de administrador para gestionar unidades no implica por sí sola permiso financiero. Las filas con **P** requieren capacidad adicional, por ejemplo `finance.charge.manage` o `finance.payment.approve`.

## 5. Reglas de autorización obligatorias

1. **Identidad:** validar sesión y vigencia del token; no confiar en datos del cliente HTTP sobre identidad o rol.
2. **Ámbito cliente:** comprobar membresía activa del usuario en el `cliente_id` que posee el recurso.
3. **Ámbito condominio:** comprobar asignación o permiso para el `condominio_id` concreto.
4. **Ámbito unidad:** para residentes, verificar relación vigente con el `unidad_id` y el permiso requerido.
5. **Acción:** verificar una capacidad específica para las operaciones sensibles (`payment.approve`, `resident.invite`, etc.).
6. **Relaciones temporales:** al terminar una ocupación o membresía, revocar acceso vigente sin borrar historial.
7. **Documentos:** autorizar antes de emitir acceso temporal al archivo; no usar depósitos públicos para recibos privados.
8. **Auditoría:** registrar altas/bajas de permisos, cambios de responsables, validación/anulación de pagos y accesos administrativos excepcionales.
9. **Separación de funciones:** quien presenta un comprobante no puede autoaprobarlo; deben registrarse aprobador y momento.
10. **No filtrar información:** limitar respuestas y resultados de búsqueda al ámbito del usuario; nunca consultar todos los datos y filtrarlos solo en React.

## 6. Ejemplos de prueba de seguridad

| Caso | Resultado esperado | Razón |
|---|---|---|
| Administrador del condominio A solicita una cuota privada de B sin asignación | 403 o 404* | Evita acceso entre condominios |
| Residente del departamento 302 solicita recibo del 303 sin autorización | 403 o 404* | Evita BOLA/IDOR |
| Residente adicional solicita lista de cuotas de su unidad sin permiso financiero delegado | 403 | Acceso financiero denegado por defecto |
| Responsable principal solicita invitar a un conviviente | Se crea solicitud pendiente, sin acceso inmediato | Requiere aprobación administrativa |
| Administrador aprueba la solicitud | Se genera invitación de uso único, con caducidad | Incorporación controlada |
| Usuario presenta un comprobante e intenta aprobar su propio pago | 403 | Separación de funciones |
| Supercliente sin permiso financiero intenta validar un pago | 403 | Supervisión no equivale a operar |
| Antiguo inquilino intenta acceder tras finalizar su relación | 403 o 404* | Revocación basada en vigencia |
| Visitante consulta una publicación pública | 200 | Recurso explícitamente público |
| Visitante intenta descargar comprobante privado | 401 o 404* | Sin autenticación / no revelar recurso |

\* Se elegirá consistentemente entre `403 Forbidden` y `404 Not Found` según la política de no divulgación del recurso; `401 Unauthorized` corresponde a ausencia o invalidez de autenticación.

## 7. Implicaciones para PostgreSQL (sujetas a revisión en Día 3)

- `usuarios`: identidad autenticada; sin rol único obligatorio ni `unidad_id` único.
- `clientes` y `condominios`: cada condominio queda vinculado a su cliente.
- `membresias_cliente`: relaciones de usuario con cliente y capacidades de supervisión.
- `membresias_condominio`: relaciones operativas por condominio y estado de vigencia.
- `permisos` + asignaciones, o roles de alcance con permisos definidos: mecanismo a decidir evitando asignaciones contradictorias.
- `unidades` y `relaciones_unidad`: propietario, ocupante, responsable principal y responsable de pago, con periodo de vigencia.
- `solicitudes_residentes` + `invitaciones`: aprobación antes del alta del acceso.
- `cuotas`, `pagos`, `comprobantes`: todos vinculados al condominio y unidad correctos; validaciones financieras explícitas.
- `auditoria`: actor, acción, objeto, fecha, resultado y contexto relevante, sin secretos ni datos excesivos.

La restricción «un responsable principal activo por unidad» debe aplicarse también a nivel de base de datos (por ejemplo, índice único parcial), no solo en la interfaz.

## 8. Decisiones y pendientes controlados

**Aprobado:** supercliente supervisa su cartera; funciones sensibles requieren permiso adicional. Responsable principal solicita altas de convivientes; administrador aprueba. Unidades admiten varios ocupantes con cuentas individuales. Datos y finanzas aislados por condominio.

**Pendiente para diseño fino:** quién concede/revoca capacidades financieras y bajo qué doble verificación; si el propietario no residente tendrá cuenta opcional; permisos delegados a residentes adicionales; procedimiento de soporte excepcional; protección contra abuso de invitaciones; caducidad de tokens y sesiones.

## 9. Criterio de finalización de esta tarjeta

- [x] Actores identificados y diferencias documentadas.
- [x] Matriz de operaciones y ámbitos propuesta.
- [x] Reglas de autorización y casos de prueba definidos.
- [ ] Revisar conjuntamente los puntos pendientes antes de considerar la matriz definitiva.
- [ ] Subir este archivo a `docs/roles-permisos.md` en GitHub.
- [ ] Vincular el commit en Trello y mover la tarjeta a **Terminado**.
