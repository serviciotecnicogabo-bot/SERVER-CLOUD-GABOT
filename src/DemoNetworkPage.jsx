import { useCallback, useEffect, useState } from 'react';
import { Activity, CheckCircle2, Cpu, RefreshCw, Router, ShieldCheck, Wifi } from 'lucide-react';

export default function DemoNetworkPage({ token }) {
  const [state, setState] = useState(null);
  const [selectedOnu, setSelectedOnu] = useState('');
  const [subscriptions, setSubscriptions] = useState([]);
  const [selectedSubscription, setSelectedSubscription] = useState('');
  const [username, setUsername] = useState('23huallaga789-150');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const request = useCallback(async (path, options = {}) => {
    const response = await fetch('/api/demo-network' + path, {
      ...options,
      headers: { Authorization: 'Bearer ' + token, ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...(options.headers || {}) },
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'No se pudo completar la operación.');
    return data;
  }, [token]);

  const load = useCallback(async () => {
    setBusy('load'); setError('');
    try {
      const [status, subscriptionsResponse] = await Promise.all([
        request('/status'),
        fetch('/api/subscriptions', { headers: { Authorization: 'Bearer ' + token } }),
      ]);
      setState(status);
      const subscriptionsData = await subscriptionsResponse.json().catch(() => ({}));
      if (!subscriptionsResponse.ok) throw new Error(subscriptionsData.error || 'No se pudieron cargar los servicios guardados.');
      const items = subscriptionsData.items || [];
      setSubscriptions(items);
      if (selectedSubscription && !items.some(item => item.id === selectedSubscription)) setSelectedSubscription('');
    }
    catch (e) { setError(e.message); }
    finally { setBusy(''); }
  }, [request, token, selectedSubscription]);

  useEffect(() => { load(); }, [load]);

  async function authorize() {
    if (!selectedOnu) return;
    setBusy('authorize'); setError(''); setMessage('');
    try { await request('/onus/' + encodeURIComponent(selectedOnu) + '/authorize', { method: 'POST' }); setMessage('ONU autorizada únicamente en el laboratorio.'); await load(); }
    catch (e) { setError(e.message); }
    finally { setBusy(''); }
  }

  async function createPppoe(e) {
    e.preventDefault(); setBusy('pppoe'); setError(''); setMessage('');
    try { await request('/pppoe', { method: 'POST', body: JSON.stringify({ onuId: selectedOnu, username }) }); setMessage('Usuario PPPoE creado únicamente en la simulación.'); await load(); }
    catch (e) { setError(e.message); }
    finally { setBusy(''); }
  }


  async function provisionSavedSubscription() {
    if (!selectedSubscription || !selectedOnu) return;
    setBusy('provision'); setError(''); setMessage('');
    try {
      const data = await request('/subscriptions/' + encodeURIComponent(selectedSubscription) + '/provision', {
        method: 'POST', body: JSON.stringify({ onuId: selectedOnu }),
      });
      setMessage('Provisión simulada creada para ' + data.pppoe.username + '. No se modificó ningún equipo real ni se guardó aprovisionamiento en Neon.');
      await load();
    } catch (e) { setError(e.message); }
    finally { setBusy(''); }
  }


  async function routerAction(username, action) {
    const labels = { suspend: 'suspender', reactivate: 'reactivar', delete: 'eliminar' };
    if (action === 'delete' && !window.confirm('¿Eliminar este usuario PPPoE ficticio del MikroTik virtual?')) return;
    setBusy('router'); setError(''); setMessage('');
    try {
      const options = action === 'delete' ? { method: 'DELETE' } : { method: 'POST' };
      await request('/mikrotik/' + encodeURIComponent(username) + (action === 'delete' ? '' : '/' + action), options);
      setMessage('Acción RouterOS simulada: usuario ' + labels[action] + '. No se modificó ningún router real.');
      await load();
    } catch (e) { setError(e.message); }
    finally { setBusy(''); }
  }

  async function reset() {
    if (!window.confirm('¿Reiniciar los datos ficticios del laboratorio?')) return;
    setBusy('reset'); setError(''); setMessage('');
    try { const data = await request('/reset', { method: 'POST' }); setState(data.state); setMessage('Laboratorio reiniciado. Ningún equipo real fue modificado.'); }
    catch (e) { setError(e.message); }
    finally { setBusy(''); }
  }

  return <div className="integration-page">
    <div className="welcome"><div><div className="eyebrow"><span className="live-dot"/> ENTORNO AISLADO · SIN EQUIPOS REALES</div><h1>Laboratorio FTTH</h1><p>Practica autorización de ONUs y creación PPPoE con datos ficticios.</p></div><button className="outline-button" onClick={load} disabled={!!busy}><RefreshCw size={15}/> Actualizar</button></div>
    <div className="integration-warning"><ShieldCheck size={19}/><div><b>MODO DEMOSTRACIÓN</b><p>Esta pantalla no se conecta a MikroTik, SmartOLT ni guarda cambios en Neon. Los datos existen solo en la memoria del servidor.</p></div></div>
    {error && <p className="integration-error">{error}</p>}
    {message && <p className="integration-success"><CheckCircle2 size={16}/>{message}</p>}
    {!state && !error && <section className="panel">Cargando laboratorio...</section>}
    {state && <>
      <div className="stats-grid compact">
        <div className="stat-card"><div className="stat-top">OLT ficticias <Cpu size={18}/></div><strong>{state.olts.length}</strong><div className="stat-foot">Inventario de prueba</div></div>
        <div className="stat-card"><div className="stat-top">ONUs detectadas <Router size={18}/></div><strong>{state.onus.length}</strong><div className="stat-foot">Seriales ficticios</div></div>
        <div className="stat-card"><div className="stat-top">PPPoE simulados <Wifi size={18}/></div><strong>{state.pppoe.length}</strong><div className="stat-foot">Sin RouterOS real</div></div>
        <div className="stat-card"><div className="stat-top">Eventos <Activity size={18}/></div><strong>{state.events.length}</strong><div className="stat-foot">Bitácora temporal</div></div>
      </div>
      <section className="panel"><div className="panel-heading"><div><h2>ONUs del laboratorio</h2><p>Selecciona una ONU ficticia para autorizarla.</p></div><span className="status-chip"><i/> Simulado</span></div>
        <div className="table-wrap"><table><thead><tr><th>SERIAL</th><th>OLT</th><th>PUERTO PON</th><th>ESTADO</th></tr></thead><tbody>{state.onus.map(onu=><tr key={onu.id} onClick={()=>setSelectedOnu(onu.id)} style={{cursor:'pointer',background:selectedOnu===onu.id?'#1b2b45':'transparent'}}><td>{onu.serial}</td><td>{onu.oltId}</td><td>{onu.pon}</td><td>{onu.status==='AUTHORIZED'?'Autorizada (demo)':'Pendiente'}</td></tr>)}</tbody></table></div>
        <div className="integration-actions" style={{marginTop:14}}><select className="status-select" value={selectedOnu} onChange={e=>setSelectedOnu(e.target.value)}><option value="">Selecciona ONU</option>{state.onus.map(onu=><option key={onu.id} value={onu.id}>{onu.serial} · {onu.status}</option>)}</select><button className="primary-button" onClick={authorize} disabled={!selectedOnu||!!busy||state.onus.find(x=>x.id===selectedOnu)?.status==='AUTHORIZED'}><CheckCircle2 size={15}/>{busy==='authorize'?'Autorizando...':'Autorizar ONU (demo)'}</button></div>
      </section>
      <section className="panel"><div className="panel-heading"><div><h2>Provisión desde servicio guardado</h2><p>Usa la identidad PPPoE que ya está guardada en Neon Development; el alta resultante será ficticia y temporal.</p></div><span className="status-chip"><i/> Solo demo</span></div>
        <div className="integration-actions">
          <select className="status-select" value={selectedSubscription} onChange={e=>setSelectedSubscription(e.target.value)}>
            <option value="">Selecciona servicio guardado</option>
            {subscriptions.filter(item=>item.status==='ACTIVE' && item.pppoeUsername).map(item=><option key={item.id} value={item.id}>{item.customer?.name || 'Cliente'} · {item.pppoeUsername} · {item.plan?.speedDown || 0} Mbps</option>)}
          </select>
          <button className="primary-button" onClick={provisionSavedSubscription} disabled={!selectedSubscription||!selectedOnu||!!busy||state.onus.find(x=>x.id===selectedOnu)?.status!=='AUTHORIZED'}>
            {busy==='provision'?'Simulando provisión...':'Provisión guardada (demo)'}
          </button>
        </div>
        <p className="integration-hint">Requiere seleccionar y autorizar primero una ONU ficticia. No llama a SmartOLT ni a MikroTik y no modifica el servicio real.</p>
      </section>
      <section className="panel"><div className="panel-heading"><div><h2>Crear usuario PPPoE</h2><p>El formato usa zona + calle + número + código de plan.</p></div></div>
        <form onSubmit={createPppoe}><label style={{display:'block',fontSize:10,color:'#b8c4d6',marginBottom:12}}>Usuario PPPoE<input value={username} onChange={e=>setUsername(e.target.value.toLowerCase())} required pattern="[0-9]{2}[a-z]+[0-9]+-[0-9]{3}" style={{display:'block',width:'100%',maxWidth:420,height:39,marginTop:7,border:'1px solid #34435c',background:'#0c1526',color:'#fff',borderRadius:8,padding:'0 11px'}}/></label><p className="integration-hint">100 = 300 Mbps / S/75 · 150 = 450 Mbps / S/95 · 200 = 650 Mbps / S/125. El código de plan no es una VLAN.</p><button className="primary-button" disabled={!selectedOnu||!!busy||state.onus.find(x=>x.id===selectedOnu)?.status!=='AUTHORIZED'}>{busy==='pppoe'?'Creando...':'Crear PPPoE (demo)'}</button></form>
      </section>
      <section className="panel"><div className="panel-heading"><div><h2>Sesiones PPPoE simuladas</h2><p>No existen en ningún router real.</p></div></div><div className="table-wrap"><table><thead><tr><th>USUARIO</th><th>PLAN</th><th>VELOCIDAD</th><th>PRECIO</th><th>ESTADO</th></tr></thead><tbody>{state.pppoe.map(p=><tr key={p.id}><td>{p.username}</td><td>{p.planCode}</td><td>{p.speedMbps} Mbps</td><td>S/ {p.pricePen}</td><td>Simulado</td></tr>)}</tbody></table>{!state.pppoe.length&&<div className="empty">Todavía no hay usuarios PPPoE simulados.</div>}</div></section>

      <section className="panel"><div className="panel-heading"><div><h2>Simulador MikroTik RouterOS</h2><p>{state.mikrotik?.name || 'MIKROTIK-DEMO-01'} · entorno virtual sin conexión a RouterOS real.</p></div><span className="status-chip"><i/> Solo demo</span></div>
        <div className="table-wrap"><table><thead><tr><th>SECRET PPPoE</th><th>PERFIL</th><th>ESTADO ROUTEROS</th><th>ACCIONES SIMULADAS</th></tr></thead><tbody>{state.pppoe.map(p=><tr key={p.id}><td>{p.username}</td><td>{p.speedMbps} Mbps · Plan {p.planCode}</td><td>{p.routerStatus === 'SUSPENDED' ? 'Suspendido' : 'Activo'}</td><td><div className="integration-actions">
          {p.routerStatus === 'SUSPENDED' ? <button className="outline-button" disabled={!!busy} onClick={()=>routerAction(p.username,'reactivate')}>Reactivar</button> : <button className="outline-button" disabled={!!busy} onClick={()=>routerAction(p.username,'suspend')}>Suspender</button>}
          <button className="outline-button" disabled={!!busy} onClick={()=>routerAction(p.username,'delete')}>Eliminar</button>
        </div></td></tr>)}</tbody></table>{!state.pppoe.length&&<div className="empty">Crea un PPPoE en el laboratorio para probar el MikroTik virtual.</div>}</div>
      </section>
      <section className="panel"><div className="panel-heading"><div><h2>Bitácora del laboratorio</h2><p>Actividad temporal del servidor.</p></div><button className="outline-button" onClick={reset} disabled={!!busy}>Reiniciar demo</button></div>{state.events.length?state.events.map((event,i)=><div className="activity-item" key={i}><div><b>{event.action}</b><p>{event.target}</p><small>{new Date(event.at).toLocaleString('es-PE')}</small></div></div>):<div className="empty">Sin eventos todavía.</div>}</section>
    </>}
  </div>;
}
