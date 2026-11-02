import { useEffect, useState } from 'react';
import { useAuth } from '../context/useAuth';
export default function InvitationDelivery({
  condominiumId
}) {
  const {
    request
  } = useAuth();
  const [result, setResult] = useState(null),
    [revision, setRevision] = useState(0),
    [busy, setBusy] = useState(null),
    [notice, setNotice] = useState('');
  useEffect(() => {
    let active = true;
    request(`/api/v1/condominiums/${encodeURIComponent(condominiumId)}/invitations`).then(r => {
      if (active) setResult(r);
    }).catch(e => {
      if (active) setResult({
        error: e.message
      });
    });
    return () => {
      active = false;
    };
  }, [request, condominiumId, revision]);
  async function recover(invitation) {
    if (!window.confirm('Se enviará un código nuevo. El código anterior dejará de funcionar, aunque ya haya llegado por correo. ¿Continuar?')) return;
    setBusy(invitation.id);
    setNotice('');
    try {
      const result = await request(invitation.puede_recuperar ? `/api/invitations/delivery/${invitation.id}/recover` : `/api/invitations/${invitation.id}/reissue`, {
        method: 'POST',
        body: {
          confirmarInvalidacionToken: true
        }
      });
      setNotice(result.entrega === 'fallido' ? 'El código cambió, pero el correo no pudo enviarse. Revisa la entrega antes de volver a intentar.' : 'Solicitamos una nueva entrega. El código anterior ya no es válido.');
      setRevision(n => n + 1);
    } catch (e) {
      setNotice(e.message);
    } finally {
      setBusy(null);
    }
  }
  return <section className="v1-card"><h2>Entrega de invitaciones</h2><p>Consulto los envíos y recupero los que necesitan atención.</p>{notice && <p role="status" className="v1-success">{notice}</p>}{!result ? <p role="status">Consultando entregas…</p> : result.error ? <p role="alert">{result.error}</p> : !result.invitaciones.length ? <p className="v1-empty">Todavía no hay invitaciones emitidas.</p> : result.invitaciones.map(i => <article className="v1-row" key={i.id}><h3>{i.correo_destino}</h3><p>Vivienda {i.unidad} · {i.estado_entrega}<br />Invitación: {i.estado}</p>{i.estado === 'pendiente' && (i.puede_recuperar || i.estado_entrega === 'fallido') && <button className="v1-button" disabled={busy !== null} onClick={() => recover(i)}>{busy === i.id ? 'Solicitando entrega…' : 'Enviar nuevo código'}</button>}</article>)}</section>;
}
