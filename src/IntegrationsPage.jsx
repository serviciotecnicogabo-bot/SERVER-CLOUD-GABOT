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
  useEffect(()=>{if(token)load();},[token]);
  async function save(e){
    e.preventDefault();setBusy('save');setError('');setMessage('');
    try{const d=await api('/config',{method:'PUT',body:JSON.stringify(form)});setStatus(d);setForm(v=>({...v,mikrotikPassword:'',smartoltApiToken:''}));setMessage('Configuración guardada. Las claves quedan cifradas.');}
    catch(e){setError(e.message);}finally{setBusy('');}
  }
  async function test(kind){
    setBusy(kind);setError('');setResults(v=>({...v,[kind]:null}));
    try{setResults(v=>({...v,[kind]:await api('/'+kind+'/test',{method:'POST'})}));}
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
        {onus.length>0&&<div className="table-wrap"><h3>ONUs sin autorizar ({onus.length})</h3><table><thead><tr><th>SERIAL</th><th>OLT</th><th>PON</th><th>TARJETA</th><th>PUERTO</th><th>MODELO</th></tr></thead><tbody>{onus.map((o,i)=><tr key={o.sn||i}><td>{o.sn}</td><td>{o.olt_id}</td><td>{o.pon_type}</td><td>{o.board}</td><td>{o.port}</td><td>{o.onu_type_name}</td></tr>)}</tbody></table></div>}
      </section>
      <div className="integration-save-row"><span>Las claves no se muestran nuevamente al navegador.</span><button className="primary-button" disabled={!canEdit||!!busy||!status?.encryptionReady}><Save size={16}/>{busy==='save'?'Guardando...':'Guardar configuración'}</button></div>
    </form>
  </div>;
}
