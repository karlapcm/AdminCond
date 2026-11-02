import { Link } from 'react-router-dom';
import V1Layout from '../components/V1Layout';
import ActionForm from '../components/ActionForm';
import { apiRequest } from '../services/api';
export default function Recovery() {
  return <V1Layout publicPage title="Recuperar mi acceso" subtitle="Solicita un código a tu correo y elige una nueva contraseña. El código vence en 30 minutos y solo puede usarse una vez."><div className="v1-grid"><ActionForm title="1. Solicitar mi código" submit="Enviar instrucciones" fields={[{
        name: 'correo',
        label: 'Correo electrónico',
        type: 'email',
        maxLength: 254
      }]} onSubmit={body => apiRequest('/api/auth/password-recovery/request', {
        method: 'POST',
        body
      })} /><ActionForm title="2. Elegir mi contraseña" submit="Actualizar contraseña" fields={[{
        name: 'token',
        label: 'Código recibido por correo',
        maxLength: 43,
        minLength: 43,
        autoComplete: 'off'
      }, {
        name: 'nuevaPassword',
        label: 'Nueva contraseña (mínimo 12 caracteres)',
        type: 'password',
        minLength: 12,
        maxLength: 128,
        autoComplete: 'new-password'
      }, {
        name: 'confirmacion',
        label: 'Repetir contraseña',
        type: 'password',
        minLength: 12,
        maxLength: 128,
        autoComplete: 'new-password'
      }]} onSubmit={d => {
        if (d.nuevaPassword !== d.confirmacion) throw new Error('Las contraseñas no coinciden.');
        return apiRequest('/api/auth/password-recovery/confirm', {
          method: 'POST',
          body: {
            token: d.token,
            nuevaPassword: d.nuevaPassword
          }
        });
      }} /></div><p><Link to="/login">Volver a iniciar sesión</Link></p></V1Layout>;
}
