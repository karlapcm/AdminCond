import { useId, useState } from 'react';
export default function ActionForm({
  title,
  fields,
  onSubmit,
  submit = 'Guardar',
  children
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [message, setMessage] = useState('');
  const formId = useId();
  async function send(e) {
    e.preventDefault();
    const form = e.currentTarget;
    const data = Object.fromEntries(new FormData(form));
    fields.forEach(f => {
      if (f.type === 'checkbox') data[f.name] = form.elements.namedItem(f.name).checked;
    });
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const result = await onSubmit(data);
      setMessage(result?.message || 'Guardado correctamente.');
      form.reset();
    } catch (err) {
      setError(err.message || 'No pudimos guardar los cambios.');
    } finally {
      setBusy(false);
    }
  }
  return <section className="v1-card"><h2>{title}</h2>{children}<form onSubmit={send} className="v1-form"><fieldset disabled={busy}>{fields.map(f => <div key={f.name} className={f.type === 'checkbox' ? 'v1-check' : 'v1-field'}><label htmlFor={`${formId}-${f.name}`}>{f.label}</label>{f.options ? <select id={`${formId}-${f.name}`} name={f.name} required={f.required !== false} defaultValue={f.defaultValue ?? ''}><option value="">Seleccionar</option>{f.options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select> : f.type === 'textarea' ? <textarea id={`${formId}-${f.name}`} name={f.name} required={f.required !== false} maxLength={f.maxLength || 5000} rows={4} defaultValue={f.defaultValue} /> : <input id={`${formId}-${f.name}`} name={f.name} type={f.type || 'text'} required={!['checkbox'].includes(f.type) && f.required !== false} maxLength={f.maxLength || 150} minLength={f.minLength} min={f.min} step={f.step} accept={f.accept} autoComplete={f.autoComplete} defaultValue={f.defaultValue} />}</div>)}</fieldset>{error && <p className="form-error" role="alert">{error}</p>}{message && <p className="v1-success" role="status">{message}</p>}<button className="primary-button" disabled={busy}>{busy ? 'Guardando…' : submit}</button></form></section>;
}
