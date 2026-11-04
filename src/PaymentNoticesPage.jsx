import { useEffect, useState } from 'react';
import { BellRing, ImagePlus, Save, Smartphone, Wifi, X } from 'lucide-react';

const initial = {
  enabled: true, businessName: '', logoDataUrl: null, qrDataUrl: null,
  message: 'Tu servicio está próximo a vencer. Realiza tu pago para evitar la suspensión.',
  paymentInstructions: 'Escanea el código QR para realizar tu pago.', contactPhone: '',
  daysBeforeDue: 3, reconnectionFee: 0, currency: 'PEN',
};

function readImage(file) {
  return new Promise((resolve, reject) => {
    if (!file || !['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) return reject(new Error('Usa una imagen PNG, JPG o WEBP.'));
    if (file.size > 300 * 1024) return reject(new Error('La imagen debe pesar como máximo 300 KB.'));
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('No se pudo leer la imagen.'));
    reader.readAsDataURL(file);
  });
}

export default function PaymentNoticesPage({ token, subscriptions = [] }) {
  const [config, setConfig] = useState(initial);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [previewServiceId, setPreviewServiceId] = useState('');

  useEffect(() => {
    let alive = true;
    fetch('/api/payment-notices/config', { headers: { Authorization: 'Bearer ' + token } })
      .then(async response => { const data = await response.json().catch(() => ({})); if (!response.ok) throw new Error(data.error || 'No se pudo cargar la configuración.'); return data; })
      .then(data => { if (alive) setConfig({ ...initial, ...data.config, reconnectionFee: Number(data.config?.reconnectionFee || 0) }); })
      .catch(e => { if (alive) setError(e.message); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [token]);

  const previewService = subscriptions.find(item => item.id === previewServiceId) || subscriptions[0] || null;
  const previewPlan = previewService?.plan;

  function change(key, value) { setConfig(current => ({ ...current, [key]: value })); setSuccess(''); }

  async function uploadImage(key, file) {
    try { change(key, await readImage(file)); setError(''); }
    catch (e) { setError(e.message); }
  }

  async function save(e) {
    e.preventDefault(); setSaving(true); setError(''); setSuccess('');
    try {
      const response = await fetch('/api/payment-notices/config', {
        method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
        body: JSON.stringify({ ...config, reconnectionFee: Number(config.reconnectionFee), businessName: config.businessName || null, paymentInstructions: config.paymentInstructions || null, contactPhone: config.contactPhone || null }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'No se pudo guardar la configuración.');
      setConfig({ ...initial, ...data.config, reconnectionFee: Number(data.config.reconnectionFee || 0) });
      setSuccess('Configuración guardada para esta empresa.');
    } catch (e) { setError(e.message); }
    finally { setSaving(false); }
  }

  if (loading) return <section className="panel coming-panel">Cargando configuración de avisos…</section>;

  return <div className="payment-notices-page">
    <div className="welcome"><div><div className="eyebrow"><span className="live-dot"/> CONFIGURACIÓN POR EMPRESA</div><h1>Avisos de pago al cliente</h1><p>Personaliza el aviso previo al vencimiento y la página que verá el abonado al suspenderse su servicio.</p></div><span className="notice-status">{config.enabled ? 'Avisos habilitados' : 'Avisos deshabilitados'}</span></div>
    {error && <p className="client-error">{error}</p>}{success && <p className="integration-success">{success}</p>}
    <form onSubmit={save} className="notice-layout">
      <div className="notice-editor">
        <section className="panel integration-card">
          <div className="integration-heading"><BellRing size={21}/><div><h2>Reglas del aviso</h2><p>Cuándo se mostrará a los clientes.</p></div></div>
          <label className="notice-toggle"><input type="checkbox" checked={config.enabled} onChange={e=>change('enabled',e.target.checked)}/> Activar avisos de pago para esta empresa</label>
          <div className="integration-fields">
            <label>Días antes del vencimiento<input type="number" min="1" max="30" value={config.daysBeforeDue} onChange={e=>change('daysBeforeDue',Number(e.target.value))}/></label>
            <label>Costo de reconexión (S/)<input type="number" min="0" step="0.01" value={config.reconnectionFee} onChange={e=>change('reconnectionFee',e.target.value)}/></label>
            <label>Nombre comercial<input maxLength="120" value={config.businessName||''} onChange={e=>change('businessName',e.target.value)} placeholder="Nombre de la empresa"/></label>
            <label>Teléfono de contacto<input maxLength="40" value={config.contactPhone||''} onChange={e=>change('contactPhone',e.target.value)} placeholder="999 999 999"/></label>
          </div>
        </section>
        <section className="panel integration-card">
          <div className="integration-heading"><ImagePlus size={21}/><div><h2>Identidad y pagos</h2><p>Logo y QR propios de esta empresa.</p></div></div>
          <div className="notice-upload-grid">
            <label className="notice-upload">Logo de la empresa<input type="file" accept="image/png,image/jpeg,image/webp" onChange={e=>uploadImage('logoDataUrl',e.target.files?.[0])}/>{config.logoDataUrl?<img src={config.logoDataUrl} alt="Logo de empresa"/>:<span>Seleccionar logo · PNG/JPG/WEBP</span>}<small>Máximo 300 KB</small></label>
            <label className="notice-upload">QR de pago (Yape / Plin / banco)<input type="file" accept="image/png,image/jpeg,image/webp" onChange={e=>uploadImage('qrDataUrl',e.target.files?.[0])}/>{config.qrDataUrl?<img src={config.qrDataUrl} alt="QR de pago"/>:<span>Seleccionar código QR</span>}<small>Máximo 300 KB</small></label>
          </div>
          <label className="notice-field">Mensaje para el cliente<textarea rows="4" maxLength="1000" value={config.message} onChange={e=>change('message',e.target.value)}/></label>
          <label className="notice-field">Instrucciones de pago<textarea rows="3" maxLength="1000" value={config.paymentInstructions||''} onChange={e=>change('paymentInstructions',e.target.value)}/></label>
        </section>
        <div className="notice-save-row"><span>Los cambios se guardan únicamente en la empresa activa.</span><button className="primary-button" disabled={saving}><Save size={16}/>{saving?'Guardando…':'Guardar configuración'}</button></div>
      </div>
      <aside className="notice-preview-column">
        <section className="panel notice-preview">
          <div className="panel-heading"><div><h2>Vista previa del cliente</h2><p>Simulación del aviso en navegador.</p></div><Smartphone size={19}/></div>
          <div className="preview-browser"><div className="preview-browser-bar"><i/><i/><i/><span>portal.cliente</span></div>
            <div className="preview-page">
              <div className="preview-brand">{config.logoDataUrl?<img src={config.logoDataUrl} alt="Logo"/>:<div className="preview-logo"><Wifi size={22}/></div>}<b>{config.businessName||'Nombre de tu empresa'}</b></div>
              <div className="preview-alert"><BellRing size={19}/><b>Recordatorio de pago</b></div>
              <p>{config.message}</p>
              <div className="preview-detail"><span>Cliente</span><b>{previewService?.customer?.name||'Nombre del cliente'}</b><span>Plan contratado</span><b>{previewPlan?.name||'Plan de internet'}</b><span>Velocidad</span><b>{previewPlan?previewPlan.speedDown+' Mbps':'—'}</b><span>Precio del plan</span><b>{previewPlan?'S/ '+Number(previewPlan.price).toFixed(2):'S/ —'}</b><span>Reconexión</span><b>S/ {Number(config.reconnectionFee||0).toFixed(2)}</b></div>
              {config.qrDataUrl&&<img className="preview-qr" src={config.qrDataUrl} alt="Código QR de pago"/>}
              <p className="preview-instructions">{config.paymentInstructions||'Aquí aparecerán las instrucciones de pago.'}</p>
              {config.contactPhone&&<div className="preview-contact">Consultas: {config.contactPhone}</div>}
              <button type="button" className="preview-pay-button">Información de pago</button>
            </div>
          </div>
          <div className="preview-footnote">Vista ilustrativa. Los importes de deuda reales y la activación de redirección se conectarán al módulo de facturación y MikroTik.</div>
        </section>
        <section className="panel notice-preview-controls"><h3>Cliente de ejemplo</h3><select value={previewServiceId} onChange={e=>setPreviewServiceId(e.target.value)}><option value="">Seleccionar servicio</option>{subscriptions.map(item=><option key={item.id} value={item.id}>{item.customer?.name} · {item.plan?.name}</option>)}</select><p>La vista previa toma el plan y el precio del servicio seleccionado.</p></section>
      </aside>
    </form>
  </div>;
}
