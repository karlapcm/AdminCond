# AdminCond — Requisitos y reglas de negocio V1

**Versión:** 1.0 (análisis funcional, Día 1)  
**Estado:** definición inicial; no implementado

## 1. Propósito y visión

AdminCond es una plataforma web SaaS para que empresas administradoras y particulares gestionen uno o varios condominios. Su prioridad es la administración residencial y el acceso seguro de los residentes; la web pública es complementaria.

Estado: especificación funcional inicial aprobada para el Día 1. No representa una implementación terminada.


## 2. Alcance tecnológico

Frontend: React. Backend: Node.js con Express. Base de datos: PostgreSQL. API REST y arquitectura inicial de monolito modular. GitHub para código y documentación; Trello para planificación. Docker, pruebas y despliegue AWS en etapas posteriores.


## 3. Actores y responsabilidades

| Actor | Responsabilidad |
| --- | --- |
| Visitante | Consultar publicaciones públicas y solicitar afiliación, sin cuenta. |
| Super Admin | Revisar afiliaciones y administrar la plataforma; sin acceso automático a datos privados. |
| Cliente / Supercliente | Cliente: empresa o particular contratante. Supercliente: usuario autorizado para administrar uno o más condominios del cliente. |
| Administrador de condominio | Gestionar unidades, invitaciones, cuotas, pagos, comunicados y áreas comunes según permisos. |
| Responsable principal | Persona designada por unidad para sus gestiones; puede ser propietario o inquilino. |
| Residente adicional | Ocupante autorizado con identidad individual y permisos limitados. |
| Propietario | Titular del inmueble; puede no vivir allí ni ser responsable del pago. |
| Junta de propietarios | Órgano distinto de la empresa administradora; responsabilidades sujetas a acuerdos y normativa aplicable. |

## 4. Requisitos funcionales V1

- RF-01: Mostrar publicaciones públicas de condominios afiliados sin requerir cuenta pública.
- RF-02: Recibir solicitudes de afiliación y permitir aprobación/rechazo por Super Admin.
- RF-03: Gestionar clientes y vincular uno o varios condominios a cada cliente.
- RF-04: Gestionar edificios, pisos y unidades/departamentos.
- RF-05: Registrar propietarios, ocupantes, responsable principal y responsable de pago como relaciones diferenciadas.
- RF-06: Administrador invita usuarios; el responsable puede solicitar residentes adicionales sujetos a aprobación administrativa.
- RF-07: Autenticación individual y permisos por rol, cliente, condominio y recurso.
- RF-08: Generar cuotas por unidad y periodo, consultar saldos y registrar pagos manuales.
- RF-09: Adjuntar comprobantes privados y validar o rechazar pagos con trazabilidad.
- RF-10: Publicar comunicados y datos de juntas para residentes autorizados.
- RF-11: Gestionar documentos privados según autorización.
- RF-12: Configurar áreas comunes existentes por condominio, horarios, normas, estado y cierres con motivo.
- RF-13: Registrar auditoría de operaciones relevantes.

## 5. Requisitos no funcionales

- RNF-01 Seguridad: contraseñas con hash seguro, autenticación y autorización backend; proteger contra accesos entre clientes y condominios.
- RNF-02 Privacidad: archivos privados con controles de acceso; no publicar datos de residentes por defecto.
- RNF-03 Integridad: claves foráneas, restricciones y transacciones para operaciones financieras.
- RNF-04 Trazabilidad: registro de quién realizó cambios relevantes y cuándo.
- RNF-05 Mantenibilidad: código modular, migraciones, documentación API y pruebas automatizadas.
- RNF-06 Operación: secretos fuera del repositorio, HTTPS en producción, copias de seguridad y monitoreo al desplegar.
- RNF-07 Usabilidad: interfaces adaptables a móvil y escritorio, estados y errores comprensibles.

## 6. Reglas de negocio

| Código | Regla |
| --- | --- |
| RN-01 | Un cliente puede administrar uno o varios condominios. |
| RN-02 | Cada condominio pertenece a un cliente activo dentro de la plataforma. |
| RN-03 | El Super Admin aprueba la afiliación antes de habilitar el condominio. |
| RN-04 | Cada condominio puede tener edificios, pisos y unidades. |
| RN-05 | Una unidad puede tener como máximo un responsable principal activo. |
| RN-06 | Una unidad puede tener varios residentes adicionales autorizados, con cuentas individuales. |
| RN-07 | El responsable principal puede ser propietario o inquilino. |
| RN-08 | Propiedad, ocupación y responsabilidad de pago son relaciones independientes. |
| RN-09 | Los residentes se incorporan mediante invitación autorizada, no por autorregistro libre. |
| RN-10 | Las cuotas corresponden a una unidad y periodo. |
| RN-11 | Los pagos manuales requieren validación antes de confirmarse. |
| RN-12 | Comprobantes y documentos privados solo son visibles para autorizados. |
| RN-13 | No se permite acceso transversal entre clientes, condominios o unidades sin autorización. |
| RN-14 | Los cambios sensibles se auditan. |
| RN-15 | Los visitantes consultan publicaciones públicas sin registrarse. |
| RN-16 | Cada condominio mantiene registros financieros independientes; la cuenta receptora depende de sus acuerdos. |
| RN-17 | El responsable principal solicita residentes adicionales; el administrador aprueba antes de invitarlos. |
| RN-18 | Las áreas comunes son opcionales y configurables por condominio; los cierres incluyen estado y motivo. |
| RN-19 | La salida de un ocupante revoca su acceso activo a la unidad, conservando el historial necesario. |
| RN-20 | La validación de pagos solo corresponde a usuarios con permiso financiero explícito. |

## 7. Flujos funcionales

- Afiliación: solicitante envía datos → Super Admin revisa → aprueba/rechaza → se crea o vincula cliente → se habilita condominio y acceso autorizado.
- Alta residencial: administrador registra unidad y vínculos personales → invita al responsable → activa cuenta → responsable solicita otros ocupantes → administrador aprueba → se envían invitaciones.
- Cuotas y pagos V1: administrador emite cuota → responsable consulta → pago externo → adjunta comprobante → validador autorizado aprueba/rechaza → saldo se actualiza.
- Comunicaciones: administrador publica comunicado o junta → residentes autorizados consultan.
- Áreas comunes: administrador registra instalación y reglas → registra disponibilidad/cierre temporal → residentes consultan el estado.

## 8. Permisos y seguridad: criterios

- Super Admin gestiona plataforma y afiliaciones, pero no tiene acceso irrestricto por defecto a documentos o pagos de residentes.
- Supercliente opera únicamente sobre condominios del cliente y funciones asignadas.
- Administrador gestiona solo condominios autorizados; validación financiera exige permiso específico.
- Responsable principal ve obligaciones de su unidad y puede solicitar incorporación de ocupantes.
- Residente adicional ve comunicados y servicios autorizados; no obtiene automáticamente acceso a comprobantes financieros.
- Propietario no ocupante puede obtener acceso explícito a información pertinente; se definirá en la matriz de permisos detallada.
- Toda autorización se comprueba en backend, no solo ocultando botones en React.

## 9. Alcance por versiones

| Versión | Incluye |
| --- | --- |
| V1 | Afiliación; clientes y condominios; identidad y roles; unidades y residentes; cuotas, pagos manuales y comprobantes; comunicados, juntas, documentos; áreas comunes y cierres; web pública básica; seguridad y auditoría. |
| V2 | Reservas de áreas comunes, aprobación/cancelación; pagos con tarjeta; notificaciones; incidencias; reportes avanzados. |
| V3 o posterior | Conciliación avanzada, automatizaciones, marketplace ampliado, votaciones y DevSecOps avanzado. |

## 10. Diseño previsto para pagos electrónicos

La V1 no procesa tarjetas. Se diseñará el dominio financiero para admitir varios métodos de pago, transacciones, referencias del proveedor y estados separados de cuotas y pagos. En V2 se evaluará una pasarela y el beneficiario de los fondos de cada condominio.

AdminCond no debe almacenar PAN completo ni CVV. Las confirmaciones del proveedor deberán verificarse en el servidor; nunca confiar solo en una respuesta del navegador.


## 11. Modelo de datos: preparación para Día 2

- Plataforma: clientes, solicitudes_afiliacion, condominios.
- Identidad: usuarios, membresias, roles, invitaciones.
- Residencial: edificios, unidades, relaciones_unidad, solicitudes_residentes.
- Finanzas: cuotas, pagos, comprobantes; futuras transacciones de pasarela.
- Operación: comunicados, juntas, documentos, areas_comunes, cierres_areas, auditoria.
- Decisión técnica: la relación entre usuario y unidad admite múltiples vínculos y fechas de vigencia; una membresía define alcance de acceso, no propiedad.

## 12. Decisiones pendientes / validación real

- Validar con administradoras o juntas cómo se designa la cuenta receptora de cada condominio.
- Precisar permisos financieros del propietario no residente y de los residentes adicionales.
- Definir tratamiento de pagos parciales, mora y ajustes antes de implementar finanzas.
- Precisar políticas de conservación de datos, recuperación de acceso y documentación legal.
- Definir en Día 2 cardinalidades, restricciones y nombres definitivos de tablas.

## 13. Evidencia y criterio de cierre Día 1

Se considera cerrada la definición funcional inicial. Quedan preparados este documento y su versión Markdown. El diseño detallado de roles/permisos y el DER son tareas del Día 2, no funcionalidades ya implementadas.

En Trello: adjuntar ambos documentos a la tarjeta 'Documentar requisitos y reglas del Día 1'; comprobar checklist y moverla a Terminado cuando estén guardados en GitHub.

