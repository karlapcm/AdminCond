# AdminCond — Día 19: Frontend de reservas de áreas comunes

## 1. Objetivo

Implementar una interfaz React para gestionar áreas comunes y reservas, conectada con la API desarrollada en el Día 18.

## 2. Tecnologías utilizadas

- React y React Router para los componentes y la navegación.
- JavaScript para las validaciones y gestión de estados.
- CSS responsivo para la presentación visual.
- API REST con Express y autenticación JWT.
- PostgreSQL para almacenar las áreas y reservas.

## 3. Componentes desarrollados

**`services/reservations.js`**

Centraliza las peticiones HTTP para consultar áreas comunes, crear espacios, registrar reservas, consultar la agenda y cancelar reservas.

**`pages/Reservations.jsx`**

Implementa la selección de condominios, visualización de áreas, formularios administrativos y de reservas, agenda y cancelaciones.

**`pages/Reservations.css`**

Define el diseño visual, los formularios, las tarjetas, los estados de las reservas y la adaptación a dispositivos móviles.

## 4. Funcionalidades implementadas

- Selección de condominios autorizados.
- Consulta de áreas comunes activas.
- Registro de áreas por administradores autorizados.
- Selección de unidades residenciales vinculadas al usuario.
- Reservas con fecha y horario.
- Conversión de fechas locales a formato ISO 8601.
- Validación de reservas futuras y duraciones de 30 minutos a 4 horas.
- Visualización de agenda y horarios ocupados.
- Identificación de reservas propias.
- Cancelación de reservas autorizadas.
- Actualización de datos después de registrar o cancelar.

## 5. Seguridad

La interfaz reutiliza `useAuth()` y las rutas protegidas de AdminCond.

Los formularios se muestran según la información de acceso recibida desde el backend.

Las operaciones definitivas son autorizadas nuevamente por Express, de modo que ocultar un botón no constituye el mecanismo principal de seguridad.

La agenda protege la privacidad de otros residentes mostrando los horarios ocupados sin revelar sus datos personales.

## 6. Pruebas realizadas

- `npm run lint`: correcto.
- `npm run build`: correcto.
- Administrador C visualiza las herramientas administrativas.
- Usuario A visualiza el formulario de reservas y su unidad.
- Usuario A registra una reserva desde React.
- Usuario A cancela una reserva desde React.
- La agenda se actualiza después de las operaciones.

## 7. Pruebas adicionales

- Verificar que React muestre correctamente el conflicto `409` al intentar reservar un horario ocupado.
- Comprobar los estados vacíos y los errores de conexión.
- Evaluar la interfaz en distintos tamaños de pantalla.

## 8. Observaciones

El frontend utiliza los mismos endpoints protegidos del Día 18 y no incorpora un sistema de autenticación independiente.

La restricción de superposición se mantiene en PostgreSQL, garantizando la integridad de los horarios ante intentos concurrentes.

La interfaz gestiona reservas según las relaciones de los usuarios con sus unidades y condominios.