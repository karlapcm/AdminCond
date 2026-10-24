
# AdminCond V1 — Día 33
## Integración y seguridad de flujos críticos

### Objetivo

Ampliar la cobertura automatizada de seguridad,
con especial atención al aislamiento entre condominios
de un mismo cliente y la renovación de sesiones.

### Pruebas incorporadas

#### D33-01 — Aislamiento entre condominios
- Se crea un segundo condominio del mismo cliente.
- El administrador conserva acceso al suyo.
- El administrador no puede acceder al otro condominio
  cambiando el identificador en la URL.
- Se utilizan y limpian datos temporales de TEST.

#### D33-02 — Aislamiento de comunicados
- Se verifica el acceso autorizado al condominio original.
- Se rechaza el listado de comunicados ajenos.
- Se rechaza el acceso directo por ID.
- Se impide la publicación sin autorización.
- Se comprueba que no se insertaron registros indebidos.

#### D33-03 — Rotación del refresh token
- Un refresh token válido permite renovar la sesión.
- La respuesta entrega un access token y una nueva cookie.
- El refresh token no se expone en el cuerpo JSON.
- El refresh token anterior deja de ser válido.
- El nuevo token permite renovar nuevamente.
- Se comprueba el estado persistido en PostgreSQL TEST.

### Validaciones

- Backend: 75/75 pruebas aprobadas localmente.
- Base de datos de pruebas: admincond_test.
- No se modificó la lógica de producción.

### Decisiones conservadas

- Arquitectura de monolito modular.
- Separación por cliente y condominio.
- Autorización mediante roles y membresías activas.
- JWT de acceso y refresh token rotativo en cookie HttpOnly.
- Regla financiera RN-18.

### Limitaciones

Estas pruebas no constituyen una auditoría exhaustiva.

Pendiente de evaluación:
- Renovaciones simultáneas desde varias pestañas.
- Revocaciones concurrentes de permisos y membresías.
- Auditoría integral de CSRF/XSS.
- Verificación de cookies bajo HTTPS de producción.
- Envío SMTP real de invitaciones.

### Estado

Implementadas tres pruebas automatizadas adicionales.
Pendiente de integración mediante Pull Request.
