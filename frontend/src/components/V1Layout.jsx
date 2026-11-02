import { Link } from 'react-router-dom';
import { Building2, ArrowLeft } from 'lucide-react';
import '../pages/Workspace.css';
import { useAuth } from '../context/useAuth';
export default function V1Layout({
  title,
  subtitle,
  children,
  publicPage = false
}) {
  const {
    user
  } = useAuth();
  return <div className="v1-page"><header className="v1-header"><Link className="detail-brand" to={publicPage ? '/' : '/dashboard'}><Building2 size={24} />AdminCond<span>.</span></Link><nav aria-label="Navegación"><Link to="/">Comunidad</Link>{publicPage ? <Link to="/login">Ingresar</Link> : <><Link to="/workspace">Mi condominio</Link>{user?.es_admin_plataforma && <Link to="/platform">Afiliaciones</Link>}<Link to="/dashboard"><ArrowLeft size={16} />Mi espacio</Link></>}</nav></header><main className="v1-main"><span className="section-kicker">TU COMUNIDAD, MÁS CERCA</span><h1>{title}</h1><p className="v1-subtitle">{subtitle}</p>{children}</main></div>;
}
