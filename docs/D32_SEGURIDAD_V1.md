
# AdminCond V1 — Día 32
## Verificación de seguridad y aislamiento

### Objetivo

Reforzar la cobertura automatizada de autorización,
aislamiento multi-tenant y permisos financieros RN-18.

### Pruebas incorporadas

- D32-01: una membresía de condominio revocada impide
  crear cuotas, aunque el permiso financiero siga activo.
- D32-02: una relación de unidad revocada impide
  consultar cuotas y registrar pagos asociados.
- D32-03: un administrador del cliente A no puede
  listar unidades del cliente B mediante cambio de ID.

### Resultado

72 pruebas automatizadas aprobadas localmente,
incluidas tres nuevas pruebas del Día 32.

No se modificaron las reglas de negocio ni la
arquitectura modular de AdminCond.

### Decisiones conservadas

- Aislamiento por cliente, condominio y unidad.
- Autorización mediante membresías y relaciones activas.
- RN-18: el rol administrativo no concede permisos
  financieros automáticamente.
- Validación de autorizaciones en el backend.

### Límites

Estas pruebas no constituyen una auditoría exhaustiva.

Pendiente de comprobación específica:
- Acceso entre dos condominios del mismo cliente.
- Comportamiento de todos los endpoints ante
  revocaciones concurrentes.
