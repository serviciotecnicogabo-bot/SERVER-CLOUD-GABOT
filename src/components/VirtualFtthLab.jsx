import { useEffect, useMemo, useState } from 'react';
import { Activity, Router, Network, Wifi, Monitor, ShieldAlert, ShieldCheck, CreditCard, RotateCcw, Cable } from 'lucide-react';

const initial = { olt: true, pon: true, onu: true, mikrotik: true, customer: true, suspended: false, paid: false };
const pill = (ok) => ({ display:'inline-flex',alignItems:'center',gap:6,padding:'5px 9px',borderRadius:999,fontSize:12,fontWeight:700,background:ok?'#e8f7ef':'#fff0f0',color:ok?'#147a45':'#b42318' });

export default function VirtualFtthLab(){
  const [s,setS]=useState(initial);
  const [events,setEvents]=useState(['Laboratorio iniciado en modo aislado. No se envían comandos a equipos físicos.']);
  const [services,setServices]=useState([]);
  const [selectedId,setSelectedId]=useState('');
  const [apiError,setApiError]=useState('');
  const [saving,setSaving]=useState(false);
  const token=sessionStorage.getItem('gabot_token')||'';
  useEffect(()=>{
    const controller=new AbortController();
    fetch('/api/subscriptions',{headers:{Authorization:'Bearer '+token},signal:controller.signal})
      .then(async r=>{const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||'No se pudieron cargar los servicios');return d;})
      .then(d=>{setServices(d.items||[]);setSelectedId(current=>current||d.items?.[0]?.id||'');setApiError('');})
      .catch(e=>{if(e.name!=='AbortError')setApiError(e.message);});
    return ()=>controller.abort();
  },[token]);
  const selected=services.find(x=>x.id===selectedId);
  const serviceSuspended=selected?.status==='SUSPENDED';
  const online = s.olt && s.pon && s.onu && s.mikrotik && s.customer && !(selected?serviceSuspended:s.suspended);
  const add=(msg)=>setEvents(v=>[new Date().toLocaleTimeString('es-PE')+' · '+msg,...v].slice(0,8));
  const change=(key,value,label)=>{setS(v=>({...v,[key]:value,...(key==='suspended'&&value?{paid:false}:{})}));add(label);};
  const reset=()=>{setS(initial);setEvents(['Escenario restaurado a valores iniciales.']);};
  async function setServiceStatus(status){
    if(!selected){setApiError('Primero crea y asigna un servicio en Clientes y Servicios.');return;}
    setSaving(true);setApiError('');
    try{
      const r=await fetch('/api/subscriptions/'+selected.id+'/status',{method:'PATCH',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify({status})});
      const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||'No se pudo actualizar el servicio');
      setServices(items=>items.map(x=>x.id===selected.id?d.subscription:x));
      setS(v=>({...v,suspended:status==='SUSPENDED',paid:status==='ACTIVE'&&v.suspended}));
      add(status==='SUSPENDED'?'Servicio '+selected.customer.name+' suspendido en la base de datos.':'Servicio '+selected.customer.name+' reactivado en la base de datos (prueba).');
    }catch(e){setApiError(e.message);}finally{setSaving(false);}
  }
  const devices=useMemo(()=>[
    {key:'olt',title:'OLT virtual',sub:'Chasis / equipo óptico',Icon:Network},
    {key:'pon',title:'Puerto PON 1/1/1',sub:'Puerto de acceso FTTH',Icon:Cable},
    {key:'onu',title:'ONU virtual',sub:'Serial: GABT00000001',Icon:Router},
    {key:'mikrotik',title:'MikroTik virtual',sub:'PPPoE / perfil 300 Mbps',Icon:Wifi},
    {key:'customer',title:'Cliente de prueba',sub:'Cuenta: DEMO-001',Icon:Monitor},
  ],[]);
  const btn={border:0,borderRadius:9,padding:'10px 13px',fontWeight:700,cursor:'pointer',background:'#172b4d',color:'#fff'};
  const secondary={...btn,background:'#eef2f7',color:'#26364b'};
  return <div style={{display:'grid',gap:18}}>
    <div className="welcome"><div><div className="eyebrow"><span className="live-dot"/> ENTORNO AISLADO · SIMULACIÓN</div><h1>Laboratorio virtual FTTH</h1><p>Prueba el recorrido OLT → ONU → MikroTik → cliente y el ciclo de suspensión y reconexión.</p></div><button style={secondary} onClick={reset}><RotateCcw size={15} style={{verticalAlign:'middle',marginRight:6}}/>Reiniciar escenario</button></div>
    <div className="stats-grid compact">
      <div className="stat-card"><div className="stat-top"><span>Estado del cliente</span><Activity size={18}/></div><strong style={{fontSize:22,color:online?'#16834b':'#c0392b'}}>{online?'Conectado':'Sin Internet'}</strong><div className="stat-foot">300 Mbps · Servicio seleccionado</div></div>
      <div className="stat-card"><div className="stat-top"><span>Portal de pago</span><CreditCard size={18}/></div><strong style={{fontSize:22}}>{serviceSuspended?'Visible':'No requerido'}</strong><div className="stat-foot">Solo aparece con cuenta suspendida</div></div>
      <div className="stat-card"><div className="stat-top"><span>Tipo de entorno</span><ShieldCheck size={18}/></div><strong style={{fontSize:22}}>Virtual</strong><div className="stat-foot">Sin impacto en redes reales</div></div>
    </div>
    <section className="panel" style={{padding:20}}>
      <div className="panel-heading"><div><h2>Servicio vinculado a clientes</h2><p>Selecciona una suscripción real de tu empresa. Los cambios de estado se guardan en la API y en PostgreSQL.</p></div></div>
      <label style={{display:'grid',gap:7,maxWidth:560,marginTop:12,fontSize:13,fontWeight:700}}>Servicio de prueba
        <select value={selectedId} onChange={e=>setSelectedId(e.target.value)} style={{padding:11,border:'1px solid #d7dee8',borderRadius:9}}>
          <option value="">Selecciona un servicio</option>
          {services.map(x=><option key={x.id} value={x.id}>{x.customer.name} · {x.plan.name} · {x.status}</option>)}
        </select>
      </label>
      {selected&&<p style={{fontSize:13,color:'#475569',marginTop:10}}>Cliente: <b>{selected.customer.name}</b> · Plan: <b>{selected.plan.name} ({selected.plan.speedDown} Mbps)</b> · Estado guardado: <b>{selected.status}</b></p>}
      {apiError&&<p style={{color:'#b42318',fontSize:13}}>{apiError}</p>}{!services.length&&!apiError&&<p style={{fontSize:13,color:'#64748b'}}>No hay servicios registrados. Crea un cliente, un plan y asígnale un servicio desde el panel antes de probar.</p>}
    </section>
    <section className="panel" style={{padding:20}}>
      <div className="panel-heading"><div><h2>Topología simulada</h2><p>Activa o desconecta cada componente para observar el resultado.</p></div><span style={pill(online)}>{online?'Ruta operativa':'Ruta interrumpida'}</span></div>
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(155px,1fr))',gap:12,marginTop:18}}>
        {devices.map(({key,title,sub,Icon},i)=><div key={key} style={{border:'1px solid #e4e9f0',borderRadius:12,padding:14,background:s[key]?'#fbfdff':'#fff8f8'}}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}><Icon size={22}/><span style={pill(s[key])}>{s[key]?'Activo':'Caído'}</span></div><b style={{display:'block',marginTop:13}}>{title}</b><small style={{color:'#64748b'}}>{sub}</small>
          <button style={{...secondary,width:'100%',marginTop:14}} onClick={()=>change(key,!s[key],title+(s[key]?' desconectado':' reconectado'))}>{s[key]?'Desconectar':'Reconectar'}</button>
          {i<devices.length-1&&<small style={{display:'none'}}>→</small>}
        </div>)}
      </div>
    </section>
    <section className="panel" style={{padding:20}}>
      <div className="panel-heading"><div><h2>Prueba de suspensión y pago</h2><p>Simula el comportamiento que luego se conectará a facturación y al adaptador de red.</p></div></div>
      <div style={{display:'flex',gap:10,flexWrap:'wrap',margin:'16px 0'}}>
        <button style={{...btn,background:'#b42318'}} disabled={!selected||serviceSuspended||saving} onClick={()=>setServiceStatus('SUSPENDED')}>Suspender servicio seleccionado</button>
        <button style={{...btn,background:'#147a45'}} disabled={!selected||!serviceSuspended||saving} onClick={()=>setServiceStatus('ACTIVE')}>Simular pago y reactivar</button>
      </div>
      {serviceSuspended?<div style={{border:'1px solid #fecaca',background:'#fff7f7',borderRadius:12,padding:18,maxWidth:520,margin:'0 auto',textAlign:'center'}}>
        <ShieldAlert size={30} color="#b42318"/><h2 style={{margin:'8px 0',color:'#b42318'}}>Servicio suspendido</h2><p>Tu servicio se encuentra temporalmente suspendido por falta de pago.</p><div style={{textAlign:'left',background:'#fff',borderRadius:9,padding:12,margin:'12px 0'}}><div>Cuenta: <b>{selected?.customer.code||'—'}</b></div><div>Plan: <b>{selected?.plan.name||'—'} ({selected?.plan.speedDown||0} Mbps)</b></div><div>Precio mensual del plan: <b>S/ {Number(selected?.plan.price||0).toFixed(2)}</b></div></div><div style={{border:'1px dashed #94a3b8',borderRadius:9,padding:18,display:'inline-block'}}>▦<br/><b>QR DE PAGO DEMO</b><br/><small>No procesa pagos reales</small></div></div>:<div style={{border:'1px solid #bbf7d0',background:'#f0fdf4',padding:14,borderRadius:10,color:'#166534'}}>{s.paid?'Pago de prueba confirmado. La conexión virtual está restablecida.':'El cliente no está suspendido. El portal de pago permanece oculto.'}</div>}
    </section>
    <section className="panel" style={{padding:20}}><div className="panel-heading"><div><h2>Registro de eventos</h2><p>Actividad reciente del simulador.</p></div></div><div style={{display:'grid',gap:8,marginTop:12}}>{events.map((e,i)=><div key={i} style={{padding:'9px 11px',background:'#f7f9fc',borderRadius:8,fontSize:13}}>{e}</div>)}</div></section>
    <p style={{fontSize:12,color:'#64748b'}}>Alcance de esta primera entrega: simulación funcional de estados en el navegador. No emula firmware GPON, niveles ópticos, tráfico PPPoE real ni redirección cautiva del sistema operativo. Esos pasos requieren después un entorno de laboratorio de red y pruebas de integración.</p>
  </div>;
}
