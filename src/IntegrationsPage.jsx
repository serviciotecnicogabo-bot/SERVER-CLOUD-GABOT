import { useEffect, useState } from 'react';
import { CheckCircle2, CircleAlert, RefreshCw, Save, Router, Cable } from 'lucide-react';

export default function IntegrationsPage({ token, user }) {
  const [form, setForm] = useState({ mikrotikBaseUrl:'', mikrotikUsername:'', mikrotikPassword:'', smartoltBaseUrl:'', smartoltApiToken:'' });
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [results, setResults] = useState({});
  const [onus, setOnus] = useState([]);
  const [services, setServices] = useState([]);
  const [selectedService, setSelectedService] = useState('');
  const [preflight, setPreflight] = useState(null);
  async function api(path, options={}) {
    const r=await fetch('/api/integrations'+path,{...options,headers:{Authorization:'Bearer '+token,...(options.body?{'Content-Type':'application/json'}:{}),...(options.headers||{})}});
    const d=await r.json().catch(()=>({}));
    if(!r.ok)throw new Error(d.error||'No se pudo completar la operación.');
    return d;
  }
  async function load(){
    setBusy('load');setError('');
    try{const d=await api('/status');setStatus(d);setForm(v=>({...v,mikrotikBaseUrl:d.mikrotik.baseUrl,mikrotikUsername:d.mikrotik.username,smartoltBaseUrl:d.smartolt.baseUrl}));}
    catch(e){setError(e.message);}finally{setBusy('');}
  }
  useEffect(()=>{
    if(!token)return;
    load();
    fetch('/api/subscriptions',{headers:{Authorization:'Bearer '+token}})
      .then(async r=>{const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||'No se pudieron cargar los servicios.');return d;})
      .then(d=>setServices(d.items||[]))
      .catch(e=>setError(e.message));
  },[token]);
  async function runPreflight(){
    if(!selectedService)return;
    setBusy('preflight');setError('');setPreflight(null);
    try{
      const r=await fetch('/api/provisioning/preflight/'+encodeURIComponent(selectedService),{headers:{Authorization:'Bearer '+token}});
      const d=await r.json().catch(()=>({}));
      if(!r.ok)throw new Error(d.error||'No se pudo validar el servicio.');
      setPreflight(d);
    }catch(e){setError(e.message);}finally{setBusy('');}
  }
  async function save(e){
    e.preventDefault();setBusy('save');setError('');setMessage('');
    try{const d=await api('/config',{method:'PUT',body:JSON.stringify(form)});setStatus(d);setForm(v=>({...v,mikrotikPassword:'',smartoltApiToken:''}));setMessage('Configuración guardada. Las claves quedan cifradas.');}
    catch(e){setError(e.message);}finally{setBusy('');}
  }
  async function test(kind){
    setBusy(kind);setError('');setResults(v=>({...v,[kind]:null}));
    try{const result=await api('/'+kind+'/test',{method:'POST'});setResults(v=>({...v,[kind]:result}));}
    catch(e){setResults(v=>({...v,[kind]:{connected:false,error:e.message}}));}finally{setBusy('');}
  }
  async function scan(){
    setBusy('onus');setError('');
    try{const d=await api('/smartolt/unconfigured-onus');setOnus(d.items||[]);}
    catch(e){setError(e.message);}finally{setBusy('');}
  }
  const canEdit=['OWNER','ADMIN'].includes(user?.role);
  return <div className="integration-page">
    <div className="welcome"><div><div className="eyebrow"><span className="live-dot"/> INTEGRACIONES DE RED</div><h1>MikroTik y SmartOLT Huawei</h1><p>Conecta tus equipos para preparar el alta automatizada de abonados.</p></div><button type="button" className="outline-button" onClick={load} disabled={!!busy}><RefreshCw size={15}/> Actualizar</button></div>
    {!status?.encryptionReady&&<div className="integration-warning"><CircleAlert size={18}/><div><b>Falta preparar el cifrado</b><p>El servidor necesita INTEGRATION_ENCRYPTION_KEY (mínimo 32 caracteres) antes de guardar claves.</p></div></div>}
    {error&&<div className="integration-error">{error}</div>}{message&&<div className="integration-success"><CheckCircle2 size={17}/>{message}</div>}
    <section className="panel integration-card">
      <div className="integration-heading"><CheckCircle2 size={22}/><div><h2>Prevalidación de provisión FTTH</h2><p>Revisa los datos del abonado y las integraciones antes de cualquier futura operación.</p></div><span>Solo lectura</span></div>
      <div className="integration-actions">
        <select className="status-select" value={selectedService} onChange={e=>{setSelectedService(e.target.value);setPreflight(null);}}>
          <option value="">Selecciona un servicio</option>
          {services.map(item=><option key={item.id} value={item.id}>{item.customer?.name||'Cliente'} · {item.pppoeUsername||'Sin PPPoE'} · {item.plan?.speedDown||0} Mbps</option>)}
        </select>
        <button type="button" className="outline-button" onClick={runPreflight} disabled={!selectedService||!!busy}>{busy==='preflight'?'Validando...':'Validar requisitos'}</button>
      </div>
      {preflight&&<div className="table-wrap">
        <p className={preflight.ready?'integration-success':'integration-warning'}>{preflight.summary}</p>
        <p><b>{preflight.subscription?.customerName}</b> · {preflight.subscription?.pppoeUsername||'Sin usuario PPPoE'} · {preflight.subscription?.planName||'Sin plan'} ({preflight.subscription?.speedDown||'—'} Mbps)</p>
        <table><thead><tr><th>REQUISITO</th><th>ESTADO</th><th>DETALLE</th></tr></thead><tbody>
          {preflight.checks.map(item=><tr key={item.key}><td>{item.label}</td><td>{item.ok?'Correcto':'Pendiente'}</td><td>{item.detail}</td></tr>)}
        </tbody></table>
        <p className="integration-hint">Protección activa: acciones reales deshabilitadas · cambios en equipos: ninguno · solicitudes externas: 0. Incluso si todos los requisitos están completos, esta pantalla solo prepara una revisión manual.</p>
      </div>}
    </section>
    <form onSubmit={save}>
      <section className="panel integration-card">
        <div className="integration-heading"><Router size={22}/><div><h2>MikroTik RouterOS</h2><p>API REST de RouterOS v7 mediante HTTPS.</p></div><span>{status?.mikrotik.configured?'Configurado':'Pendiente'}</span></div>
        <div className="integration-fields">
          <label>Dirección HTTPS<input type="url" placeholder="https://router.empresa.net" value={form.mikrotikBaseUrl} onChange={e=>setForm({...form,mikrotikBaseUrl:e.target.value})}/></label>
          <label>Usuario API<input value={form.mikrotikUsername} onChange={e=>setForm({...form,mikrotikUsername:e.target.value})}/></label>
          <label>Clave API<input type="password" autoComplete="new-password" placeholder={status?.mikrotik.configured?'Guardada; vacío conserva la actual':'Introduce la clave'} value={form.mikrotikPassword} onChange={e=>setForm({...form,mikrotikPassword:e.target.value})}/></label>
        </div>
        <p className="integration-hint">Requiere RouterOS v7, REST por HTTPS y certificado TLS válido. Recomendado: VPN o red privada; no expongas el API directamente a Internet.</p>
        <button type="button" className="outline-button" onClick={()=>test('mikrotik')} disabled={!status?.mikrotik.configured||!!busy}>Probar MikroTik</button>
        {results.mikrotik&&<p className={results.mikrotik.connected?'integration-success':'integration-error'}>{results.mikrotik.connected?'Conectado: '+results.mikrotik.device+' · RouterOS '+results.mikrotik.version:results.mikrotik.error}</p>}
      </section>
      <section className="panel integration-card">
        <div className="integration-heading"><Cable size={22}/><div><h2>SmartOLT · Huawei</h2><p>API para OLT y detección de ONUs.</p></div><span>{status?.smartolt.configured?'Configurado':'Pendiente'}</span></div>
        <div className="integration-fields">
          <label>Dominio SmartOLT<input type="url" placeholder="https://mioperador.smartolt.com" value={form.smartoltBaseUrl} onChange={e=>setForm({...form,smartoltBaseUrl:e.target.value})}/></label>
          <label>API Token<input type="password" autoComplete="new-password" placeholder={status?.smartolt.configured?'Guardado; vacío conserva el actual':'Introduce el X-Token'} value={form.smartoltApiToken} onChange={e=>setForm({...form,smartoltApiToken:e.target.value})}/></label>
        </div>
        <p className="integration-hint">El token se cifra en Neon. SmartOLT debe permitir la IP pública de salida de GABOT.</p>
        <div className="integration-actions"><button type="button" className="outline-button" onClick={()=>test('smartolt')} disabled={!status?.smartolt.configured||!!busy}>Probar SmartOLT</button><button type="button" className="outline-button" onClick={scan} disabled={!status?.smartolt.configured||!!busy}>{busy==='onus'?'Consultando...':'Buscar ONUs pendientes'}</button></div>
        {results.smartolt&&<p className={results.smartolt.connected?'integration-success':'integration-error'}>{results.smartolt.connected?'Conectado · OLT detectadas: '+results.smartolt.olts:results.smartolt.error}</p>}
        {onus.length>0&&<div className="table-wrap"><h3>ONUs sin autorizar ({onus.length})</h3><table><thead><tr><th>SERIAL</th><th>OLT</th><th>PON</th><th>TARJETA</th><th>PUERTO</th><th>MODELO</th></tr></thead><tbody>{onus.map((o,i)=><tr key={o.serial||o.id||i}><td>{o.serial||'—'}</td><td>{o.oltId||'—'}</td><td>{o.ponType||'—'}</td><td>{o.board||'—'}</td><td>{o.port||'—'}</td><td>{o.onuType||'—'}</td></tr>)}</tbody></table></div>}
      </section>
      <div className="integration-save-row"><span>Las claves no se muestran nuevamente al navegador.</span><button className="primary-button" disabled={!canEdit||!!busy||!status?.encryptionReady}><Save size={16}/>{busy==='save'?'Guardando...':'Guardar configuración'}</button></div>
    </form>
  </div>;
}
