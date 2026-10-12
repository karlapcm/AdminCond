# AdminCond — Arquitectura del Sistema (V1)

**Estado:** diseño aprobado para implementación progresiva (aún no implementado)  
**Día de trabajo:** Día 4 — Arquitectura y seguridad  
**Stack:** React, Node.js/Express, PostgreSQL, Docker / Docker Compose. AWS y Kubernetes en etapas posteriores.

## 1. Objetivo
Definir cómo se conectan el frontend, la API, PostgreSQL y los archivos privados; cómo organizar el código por responsabilidades; y dónde se aplicarán autenticación, autorización, validaciones y auditoría.

## 2. Decisión técnica DT-01 — Arquitectura evolutiva
AdminCond V1 empezará como una **aplicación web cliente-servidor con backend monolítico modular**. Cada módulo tiene responsabilidades definidas, pero inicialmente se despliega una sola API Express. Los componentes se prepararán para ejecutarse en contenedores Docker. Cuando el núcleo esté funcionando, se desarrollará un **microservicio de notificaciones** para practicar comunicación entre servicios y tolerancia a fallos; posteriormente se realizará un laboratorio con Kubernetes. Esto no obliga a migrar el módulo financiero a microservicios.

**Por qué:** menor complejidad de arranque, mayor facilidad para probar transacciones y controles de acceso, menos superficie operativa que proteger y posibilidad de evolucionar por necesidades medidas.

## 3. Vista general
**Navegador/React → HTTPS + API REST/JSON → Express → PostgreSQL y almacenamiento privado.**

- **Frontend React:** vistas públicas y paneles de Super Admin, Supercliente, administradores, responsables y residentes. Puede ocultar funciones no permitidas para mejorar la experiencia, pero esto **no constituye seguridad**.
- **API Express:** autenticación, permisos, validación de entradas, reglas de negocio, consultas autorizadas y registro de auditoría.
- **PostgreSQL:** relaciones, transacciones, restricciones de integridad, índices y privilegios mínimos.
- **Archivos privados:** comprobantes y documentos fuera del acceso público; en AWS se plantea S3 privado, con acceso temporal tras autorización.
- **Infraestructura:** contenedores Docker y Compose en desarrollo; HTTPS, redes privadas, gestión de secretos y monitoreo al desplegar.

## 4. Flujo de ejemplo: consultar un recibo
1. El residente abre su panel React y solicita `GET /api/v1/receipts/:id`.
2. Express autentica la sesión; extrae identidad de credenciales verificadas, no de un `usuario_id` suministrado por el navegador.
3. El servicio verifica el permiso para leer el recibo, la membresía/relación residencial activa, el condominio, la unidad y el recurso concreto.
4. El repositorio consulta únicamente el recurso autorizado en PostgreSQL.
5. Si hay archivo privado, el backend autoriza y facilita un acceso temporal de corta duración; si no hay permiso, rechaza la operación.
6. La API devuelve la información mínima necesaria. Los eventos sensibles pertinentes se auditan sin registrar secretos.

## 5. Estructura inicial del repositorio
```text
AdminCond/
├── frontend/
│   └── src/
│       ├── components/
│       ├── pages/
│       ├── features/
│       ├── services/
│       └── routes/
├── backend/
│   └── src/
│       ├── modules/
│       │   ├── auth/
│       │   ├── clients/
│       │   ├── condominiums/
│       │   ├── residents/
│       │   ├── finance/
│       │   ├── announcements/
│       │   └── common-areas/
│       ├── middleware/
│       ├── config/
│       ├── database/
│       └── app.js
├── services/notifications/        # Etapa posterior
├── infrastructure/docker/
├── infrastructure/kubernetes/     # Laboratorio posterior
├── docs/
│   ├── requisitos.md
│   ├── roles-permisos.md
│   ├── modelo-datos.md
│   └── arquitectura.md
├── compose.yaml
├── .gitignore
└── README.md
```
La estructura es **propuesta**: las carpetas se crearán gradualmente, no todas en el Día 4.

## 6. Responsabilidades internas del backend
| Componente | Responsabilidad |
|---|---|
| Ruta (`route`) | Define endpoint, método y middleware aplicable. |
| Middleware | Autentica, valida formato, controla solicitudes y errores comunes. |
| Controlador (`controller`) | Interpreta la solicitud y produce la respuesta HTTP. |
| Servicio (`service`) | Aplica reglas de negocio y autorización sobre recursos específicos. |
| Repositorio (`repository`) | Ejecuta consultas parametrizadas y operaciones de datos con el ámbito correcto. |
| Auditoría | Registra operaciones sensibles y denegaciones relevantes sin secretos. |

**Advertencia:** no se debe confiar en un `condominio_id`, `cliente_id` o `rol` enviado por React; el servidor resuelve el ámbito desde el usuario autenticado y verifica el recurso real. Una ruta protegida debe fallar cerrada si no puede confirmar su autorización.

## 7. Módulos V1
| Módulo | Alcance |
|---|---|
| Autenticación | Acceso, invitaciones, recuperación, sesiones y revocación. |
| Clientes y afiliaciones | Solicitudes y aprobación por Super Admin; asociación de condominios. |
| Condominios | Sectores, edificios y unidades opcionales según RN-19. |
| Residentes | Propietario, ocupante, responsable principal y de pago; solicitudes aprobadas. |
| Finanzas | Cuotas, pagos manuales, comprobantes y validación segregada. |
| Comunicaciones | Comunicados, juntas y documentos autorizados. |
| Áreas comunes | Instalaciones, reglas, disponibilidad y cierres; reservas para V2. |
| Seguridad y auditoría | Permisos, verificaciones por recurso, trazabilidad. |

## 8. Controles de seguridad por capa
| Capa | Controles requeridos |
|---|---|
| React | No almacenar secretos; no confiar en botones ocultos como defensa. |
| API / middleware | Validación de JWT/sesión, validación de entradas, manejo seguro de errores, controles contra abuso. |
| Servicios | Autorización por cliente + condominio + unidad/recurso, denegar por defecto, separación de funciones. |
| PostgreSQL | Claves foráneas, restricciones compuestas, índices, transacciones y usuario de BD con privilegios mínimos. |
| Archivos | Almacenamiento privado, rutas no predecibles como única defensa, acceso firmado temporal después de autorización. |
| Docker | Imágenes actualizadas, usuario no root cuando sea viable, volúmenes y secretos fuera de imágenes/repositorio. |
| Despliegue | HTTPS, BD no expuesta a Internet, gestión de secretos, copias de seguridad y monitoreo. |
| Kubernetes futuro | RBAC, Secrets gestionados con protección, políticas de red cuando proceda, probes y recursos limitados. |

**RN-18:** Solo el Supercliente autorizado concede o revoca permisos financieros a administradores de su ámbito con autenticación reforzada y auditoría. La revocación se comprobará en operaciones posteriores, aunque un JWT siga vigente. Quien registra un pago no puede aprobarlo.

## 9. Docker, microservicios y Kubernetes: evolución
**Etapa inicial:** frontend, API Express y PostgreSQL se podrán levantar localmente con Docker Compose; tres contenedores no significan tres microservicios.

**Etapa intermedia:** incorporar un microservicio independiente de notificaciones. Las acciones principales no deben depender de que llegue inmediatamente un correo; se podrán usar eventos persistentes, colas y reintentos. Se deben considerar autenticación entre servicios, idempotencia y observabilidad.

**Etapa posterior:** desplegar un entorno de aprendizaje en Kubernetes (por ejemplo, con kind o Minikube) con Deployments, Services, ConfigMaps, Secrets y controles de recursos. Kubernetes no garantiza por sí solo disponibilidad ni seguridad.

**Criterios para evaluar extracción de microservicios:** necesidades medibles de escalado, independencia de despliegue, aislamiento de fallos o límites de dominio claramente definidos; no separar solo por moda.

## 10. Decisiones aún abiertas
- Proveedor de alojamiento AWS y arquitectura final de redes, HTTPS y secretos (se elegirá con presupuesto y necesidades reales).
- Herramienta de migraciones y acceso a PostgreSQL.
- Estrategia exacta de sesiones, renovación y revocación de tokens; protección ante CSRF según transporte elegido.
- Mecanismo concreto de almacenamiento de archivos durante desarrollo local.
- Servicio de cola/eventos y contrato de integración del futuro microservicio de notificaciones.
- Diseño de escalado, respaldos y observabilidad en producción.

## 11. Pruebas de aceptación futuras (aún no ejecutadas)
1. Un administrador del condominio A no accede a los documentos privados de B.
2. Un residente del 302 no accede a recibos privados del 303 sin autorización.
3. Un administrador no se autoasigna permisos financieros ni valida su propio pago.
4. Una revocación de permisos bloquea operaciones siguientes, aun con un JWT todavía válido.
5. Sin el microservicio de notificaciones, una operación residencial confirmada no se revierte solo porque no pudo enviarse un correo.
6. PostgreSQL no es accesible públicamente cuando el despliegue esté configurado.


**Nota de estado:** la arquitectura es un **diseño objetivo**. No equivale a código creado, controles probados ni infraestructura desplegada.
