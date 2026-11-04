import { useEffect, useState } from 'react';
import { BellRing, LogOut, Wifi, AlertTriangle, CheckCircle2 } from 'lucide-react';

const money = (value, currency = 'PEN') => new Intl.NumberFormat('es-PE', { style: 'currency', currency }).format(Number(value || 0));
const date = value => value ? new Intl.DateTimeFormat('es-PE', { dateStyle: 'long' }).format(new Date(value)) : 'Sin fecha';

export default function CustomerPortalPage({ token, user, onLogout }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    fetch('/api/payment-notices/portal/me', { headers: { Authorization: 'Bearer ' + token } })
      .then(async response => {
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.error || 'No se pudo cargar tu información.');
        return payload;
      })
      .then(payload => { if (alive) setData(payload); })
      .catch(reason => { if (alive) setError(reason.message); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [token]);

  if (loading) return <main className="customer-portal-shell"><section className="customer-portal-card">Cargando tu información de servicio…</section></main>;
  if (error) return <main className="customer-portal-shell"><section className="customer-portal-card"><h1>No se pudo abrir tu portal</h1><p>{error}</p><button className="primary-button" onClick={onLogout}>Cerrar sesión</button></section></main>;

  const notice = data.notice || {};
  const service = data.service;
  const invoices = data.invoices || [];
  const currency = invoices[0]?.currency || service?.plan?.currency || notice.currency || 'PEN';
  const suspended = Boolean(data.suspended);
  const amount = Number(data.outstandingBalance || 0);
  const reconnection = Number(notice.reconnectionFee || 0);

  return <main className="customer-portal-shell">
    <header className="customer-portal-header">
      <div className="customer-portal-brand">{notice.logoDataUrl ? <img src={notice.logoDataUrl} alt="Logo de la empresa"/> : <span className="customer-portal-logo"><Wifi size={24}/></span>}<div><b>{notice.businessName || 'Portal de clientes'}</b><small>Atención al abonado</small></div></div>
      <button className="outline-button" onClick={onLogout}><LogOut size={16}/> Salir</button>
    </header>
    <section className="customer-portal-card">
      <div className={'customer-portal-status ' + (suspended ? 'is-suspended' : 'is-active')}>{suspended ? <AlertTriangle size={20}/> : <CheckCircle2 size={20}/>}<div><b>{suspended ? 'Servicio suspendido' : 'Estado de tu servicio'}</b><span>{suspended ? 'Realiza el pago pendiente y comunícate con tu empresa para solicitar la reconexión.' : 'Consulta aquí tu plan y tus próximos pagos.'}</span></div></div>
      <p className="customer-portal-greeting">Hola, <b>{data.customer.name}</b></p>
      <div className="customer-portal-grid">
        <div><span>Plan contratado</span><b>{service?.plan?.name || 'Sin plan asignado'}</b></div>
        <div><span>Velocidad</span><b>{service?.plan ? service.plan.speedDown + ' / ' + service.plan.speedUp + ' Mbps' : '—'}</b></div>
        <div><span>Precio mensual</span><b>{service?.plan ? money(service.plan.price, service.plan.currency || currency) : '—'}</b></div>
        <div><span>Saldo pendiente</span><b className={amount > 0 ? 'portal-amount-due' : ''}>{money(amount, currency)}</b></div>
        {suspended && <div><span>Costo de reconexión</span><b>{money(reconnection, notice.currency || currency)}</b></div>}
      </div>
      {amount > 0 && <section className="customer-portal-invoices"><h2>Facturas pendientes</h2>{invoices.map(invoice => <div className="customer-portal-invoice" key={invoice.id}><div><b>{invoice.number}</b><small>Vence: {date(invoice.dueDate)}</small></div><strong>{money(invoice.balance, invoice.currency || currency)}</strong></div>)}</section>}
      <section className="customer-portal-payment">
        <h2>{suspended ? 'Cómo recuperar tu servicio' : 'Medios de pago'}</h2>
        <p>{notice.message || 'Realiza tu pago para mantener tu servicio activo.'}</p>
        {notice.qrDataUrl && <img className="customer-portal-qr" src={notice.qrDataUrl} alt="Código QR de pago"/>}
        <p>{notice.paymentInstructions || 'Escanea el código QR o consulta con tu empresa los medios de pago disponibles.'}</p>
        {notice.contactPhone && <a href={'tel:' + notice.contactPhone}>Contactar a {notice.contactPhone}</a>}
      </section>
      {suspended && <p className="customer-portal-disclaimer">Después de pagar, envía tu comprobante a la empresa. La reconexión debe ser confirmada por el operador.</p>}
    </section>
    <footer className="customer-portal-footer">Cuenta {user?.email || ''} · {data.customer.code}</footer>
  </main>;
}
