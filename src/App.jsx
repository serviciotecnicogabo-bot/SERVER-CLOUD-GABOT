import { useEffect, useMemo, useState } from 'react';
import {
  Activity, Bell, Cable, ChartNoAxesCombined, Check, ChevronDown, ChevronLeft,
  ChevronRight, CircleDollarSign, ClipboardList, CreditCard, Download, Gauge,
  Headset, LayoutDashboard, LifeBuoy, Menu, Network, Plus, Search, Settings,
  ShieldCheck, Signal, Users, Wallet, Wifi, X, Zap, Router, Building2, Boxes
} from 'lucide-react';

const nav = [
  { title: 'GENERAL', items: [
    ['dashboard','Panel principal',LayoutDashboard],
    ['clients','Clientes',Users],
    ['plans','Planes de internet',Wifi],
    ['services','Servicios activos',Signal],
  ]},
  { title: 'OPERACIONES FTTH', items: [
    ['network','Red y OLT',Network],
    ['onus','ONU / ONT',Router],
    ['incidents','Incidencias',LifeBuoy],
    ['technicians','Técnicos',Headset],
  ]},
  { title: 'FINANZAS', items: [
    ['billing','Facturación',ClipboardList],
    ['payments','Pagos',CreditCard],
    ['debts','Control de deudas',Wallet],
  ]},
  { title: 'SISTEMA', items: [
    ['inventory','Inventario',Boxes],
    ['reports','Reportes',ChartNoAxesCombined],
    ['settings','Configuración',Settings],
  ]}
];

const pageTitles = {
 dashboard:'Panel principal',clients:'Clientes',plans:'Planes de internet',services:'Servicios activos',
 network:'Red y OLT',onus:'ONU / ONT',incidents:'Incidencias',technicians:'Técnicos',
 billing:'Facturación',payments:'Pagos',debts:'Control de deudas',inventory:'Inventario',
 reports:'Reportes',settings:'Configuración'
};

function mapCustomer(c){
  const statuses={ACTIVE:'Activo',SUSPENDED:'Suspendido',PENDING:'Pendiente',INACTIVE:'Inactivo'};
  return {id:c.code||c.id,dbId:c.id,name:c.name,plan:'Sin plan asignado',zone:c.district||'Sin zona',status:statuses[c.status]||c.status,balance:'—'};
}

function App(){
  const [active,setActive]=useState('dashboard');
  const [mobileOpen,setMobileOpen]=useState(false);
  const [query,setQuery]=useState('');
  const [clients,setClients]=useState([]);
  const [showAdd,setShowAdd]=useState(false);
  const [newName,setNewName]=useState('');
  const [newZone,setNewZone]=useState('');
  const [newDocument,setNewDocument]=useState('');
  const [newEmail,setNewEmail]=useState('');
  const [newPhone,setNewPhone]=useState('');
  const [newAddress,setNewAddress]=useState('');
  const [newNotes,setNewNotes]=useState('');
  const [notice,setNotice]=useState('');
  const [token,setToken]=useState(()=>sessionStorage.getItem('gabot_token')||'');
  const [user,setUser]=useState(null);
  const [authChecking,setAuthChecking]=useState(true);
  const [loginTenant,setLoginTenant]=useState('gabot');
  const [loginEmail,setLoginEmail]=useState('serviciotecnicogabo@gmail.com');
  const [loginPassword,setLoginPassword]=useState('');
  const [loginError,setLoginError]=useState('');
  const [loginLoading,setLoginLoading]=useState(false);
  const [loadingClients,setLoadingClients]=useState(false);
  const [clientError,setClientError]=useState('');
  const [refreshKey,setRefreshKey]=useState(0);
  const filtered=useMemo(()=>clients,[clients]);

  useEffect(()=>{
    let alive=true;
    if(!token){setAuthChecking(false);return ()=>{alive=false;};}
    fetch('/api/me',{headers:{Authorization:'Bearer '+token}})
      .then(async r=>{const data=await r.json().catch(()=>({}));if(!r.ok)throw new Error(data.error||'Sesión no válida');return data;})
      .then(data=>{if(alive)setUser(data.user);})
      .catch(()=>{sessionStorage.removeItem('gabot_token');if(alive){setToken('');setUser(null);}})
      .finally(()=>{if(alive)setAuthChecking(false);});
    return ()=>{alive=false;};
  },[]);

  useEffect(()=>{
    if(!token||!user)return;
    const controller=new AbortController();
    setLoadingClients(true);setClientError('');
    const params=new URLSearchParams({page:'1',limit:'100',search:query});
    fetch('/api/customers?'+params.toString(),{headers:{Authorization:'Bearer '+token},signal:controller.signal})
      .then(async r=>{const data=await r.json().catch(()=>({}));if(!r.ok)throw new Error(data.error||'No se pudieron cargar los clientes');return data;})
      .then(data=>setClients((data.items||[]).map(mapCustomer)))
      .catch(error=>{if(error.name!=='AbortError')setClientError(error.message);})
      .finally(()=>{if(!controller.signal.aborted)setLoadingClients(false);});
    return ()=>controller.abort();
  },[token,user,query,refreshKey]);

  async function login(e){
    e.preventDefault();setLoginError('');setLoginLoading(true);
    try{
      const response=await fetch('/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({tenant:loginTenant.trim(),email:loginEmail.trim(),password:loginPassword})});
      const data=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(data.error||'No se pudo iniciar sesión');
      sessionStorage.setItem('gabot_token',data.token);
      setToken(data.token);setUser(data.user);setLoginPassword('');setActive('dashboard');
    }catch(error){setLoginError(error.message);}
    finally{setLoginLoading(false);}
  }

  function logout(){
    sessionStorage.removeItem('gabot_token');setToken('');setUser(null);setClients([]);setActive('dashboard');
  }

  async function addClient(e){
    e.preventDefault();
    if(!newName.trim())return;
    const payload={name:newName.trim(),district:newZone.trim(),document:newDocument.trim(),email:newEmail.trim(),phone:newPhone.trim(),address:newAddress.trim(),notes:newNotes.trim()};
    Object.keys(payload).forEach(key=>{if(!payload[key])delete payload[key];});
    try{
      const response=await fetch('/api/customers',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify(payload)});
      const data=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(data.error||'No se pudo guardar el cliente');
      setClients(v=>[mapCustomer(data.customer),...v]);
      setNewName('');setNewZone('');setNewDocument('');setNewEmail('');setNewPhone('');setNewAddress('');setNewNotes('');
      setShowAdd(false);setNotice('Cliente guardado en Neon');setRefreshKey(v=>v+1);
      setTimeout(()=>setNotice(''),2800);
    }catch(error){setClientError(error.message);setNotice(error.message);setTimeout(()=>setNotice(''),4000);}
  }

  if(authChecking)return <div className="auth-screen"><div className="modal auth-card"><div className="brand"><div className="brand-mark"><Zap size={21}/></div><div><b>GABOT <span>CLOUD</span></b><small>FTTH MANAGEMENT</small></div></div><p>Verificando sesión segura...</p></div></div>;
  if(!token||!user)return <div className="auth-screen"><form className="modal auth-card" onSubmit={login}><div className="brand"><div className="brand-mark"><Zap size={21}/></div><div><b>GABOT <span>CLOUD</span></b><small>FTTH MANAGEMENT</small></div></div><div className="auth-heading"><div className="eyebrow"><span className="live-dot"/> ACCESO SEGURO</div><h1>Iniciar sesión</h1><p>Ingresa con tu cuenta de operador para acceder a GABOT CLOUD FTTH.</p></div><label>Empresa / identificador<input value={loginTenant} onChange={e=>setLoginTenant(e.target.value)} placeholder="gabot" required/></label><label>Correo electrónico<input type="email" value={loginEmail} onChange={e=>setLoginEmail(e.target.value)} required/></label><label>Contraseña<input type="password" value={loginPassword} onChange={e=>setLoginPassword(e.target.value)} required/></label>{loginError&&<p className="auth-error">{loginError}</p>}<button className="primary-button auth-submit" type="submit" disabled={loginLoading}>{loginLoading?'Verificando...':'Ingresar al panel'}</button></form></div>;

  const Sidebar=()=> <aside className={'sidebar '+(mobileOpen?'sidebar-open':'')}>
    <div className="brand"><div className="brand-mark"><Zap size={21}/></div><div><b>GABOT <span>CLOUD</span></b><small>FTTH MANAGEMENT</small></div><button className="mobile-close" onClick={()=>setMobileOpen(false)}><X size={19}/></button></div>
    <div className="workspace"><div className="workspace-icon"><Building2 size={17}/></div><div><b>Mi operador</b><small>Panel administrador</small></div><ChevronDown size={15}/></div>
    <nav>{nav.map(group=><div className="nav-group" key={group.title}><p>{group.title}</p>{group.items.map(([id,label,Icon])=><button key={id} className={'nav-item '+(active===id?'selected':'')} onClick={()=>{setActive(id);setMobileOpen(false)}}><Icon size={18}/><span>{label}</span>{id==='incidents'&&<i className="nav-count">3</i>}</button>)}</div>)}</nav>
    <div className="sidebar-bottom"><div className="help-card"><div className="help-icon"><ShieldCheck size={18}/></div><b>Centro de ayuda</b><small>Estamos para ayudarte</small><button onClick={()=>setNotice('Centro de ayuda: próximamente')}>Ver soporte <ChevronRight size={14}/></button></div><div className="profile"><div className="avatar">GB</div><div><b>{user?.name||'Administrador'}</b><small>{user?.role||'Usuario'}</small></div><button className="logout-button" onClick={logout}>Salir</button></div></div>
  </aside>;

  const Stat=({label,value,sub,icon:Icon,tone})=><div className="stat-card"><div className="stat-top"><span>{label}</span><div className={'stat-icon '+tone}><Icon size={19}/></div></div><strong>{value}</strong><div className="stat-foot"><span className="trend"><Activity size={13}/>{sub}</span><span>vs. mes anterior</span></div></div>;

  function Dashboard(){return <>
    <div className="welcome"><div><div className="eyebrow"><span className="live-dot"/> SISTEMA OPERATIVO</div><h1>Panel principal</h1><p>Bienvenido a tu centro de control de internet por fibra óptica.</p></div><button className="date-pill"><Activity size={15}/> Vista general <ChevronDown size={14}/></button></div>
    <div className="stats-grid">
      <Stat label="Clientes registrados" value={clients.length.toLocaleString('es-PE')} sub="+12.8%" icon={Users} tone="blue"/>
      <Stat label="Servicios activos" value="1,284" sub="+8.2%" icon={Wifi} tone="green"/>
      <Stat label="Recaudación del mes" value="S/ 48,590" sub="+14.5%" icon={CircleDollarSign} tone="violet"/>
      <Stat label="Deudas pendientes" value="S/ 6,420" sub="-3.1%" icon={Wallet} tone="orange"/>
    </div>
    <div className="main-grid">
      <section className="panel network-panel"><div className="panel-heading"><div><h2>Estado de la red</h2><p>Resumen de infraestructura FTTH</p></div><span className="status-chip"><i/> Operativa</span></div><div className="network-visual"><div className="network-orbit orbit-one"/><div className="network-orbit orbit-two"/><div className="network-core"><Network size={27}/><b>RED FTTH</b><small>Monitoreo general</small></div><div className="node node-a"><Router size={17}/><small>OLT Huawei</small><b>En línea</b></div><div className="node node-b"><Router size={17}/><small>OLT ZTE</small><b>En línea</b></div><div className="node node-c"><Router size={17}/><small>OLT VSOL</small><b>Por conectar</b></div></div><div className="network-legend"><span><i className="green-dot"/> 2 equipos en línea</span><span><i className="gray-dot"/> 1 sin integrar</span></div></section>
      <section className="panel"><div className="panel-heading"><div><h2>Actividad reciente</h2><p>Últimos movimientos del sistema</p></div><button className="icon-button"><ChevronRight size={17}/></button></div><div className="activity-list"><div className="activity-item"><div className="activity-symbol green"><Check size={16}/></div><div><b>Pago registrado</b><p>Comercial San Martín · S/ 89.90</p><small>Hace 12 minutos</small></div></div><div className="activity-item"><div className="activity-symbol blue"><Users size={16}/></div><div><b>Nuevo cliente</b><p>Registro pendiente de instalación</p><small>Hace 38 minutos</small></div></div><div className="activity-item"><div className="activity-symbol orange"><LifeBuoy size={16}/></div><div><b>Incidencia reportada</b><p>Intermitencia · Zona Breña</p><small>Hace 1 hora</small></div></div><div className="activity-item"><div className="activity-symbol violet"><Zap size={16}/></div><div><b>Servicio activado</b><p>Fibra óptica · 300 Mbps</p><small>Hace 2 horas</small></div></div></div></section>
    </div>
    <section className="panel table-panel"><div className="panel-heading"><div><h2>Clientes recientes</h2><p>Vista rápida de tu cartera de clientes</p></div><button className="text-button" onClick={()=>setActive('clients')}>Ver todos <ChevronRight size={15}/></button></div><ClientTable rows={clients.slice(0,4)}/></section>
  </>}

  function ClientTable({rows}){return <div className="table-wrap"><table><thead><tr><th>CLIENTE</th><th>PLAN</th><th>ZONA</th><th>ESTADO</th><th>SALDO</th></tr></thead><tbody>{rows.map(c=><tr key={c.id}><td><div className="client-cell"><div className="client-avatar">{c.name.slice(0,1).toUpperCase()}</div><div><b>{c.name}</b><small>{c.id}</small></div></div></td><td>{c.plan}</td><td>{c.zone}</td><td><span className={'badge '+(c.status==='Activo'?'badge-green':c.status==='Deuda'?'badge-orange':c.status==='Suspendido'?'badge-red':'badge-blue')}>{c.status}</span></td><td className="amount">{c.balance}</td></tr>)}</tbody></table>{rows.length===0&&<div className="empty">No se encontraron clientes.</div>}</div>}

  function GenericPage(){const desc={plans:'Administra velocidades, precios y condiciones comerciales.',services:'Supervisa el estado de las conexiones de tus abonados.',network:'Administra equipos OLT Huawei, ZTE y VSOL.',onus:'Controla ONT/ONU, seriales, señal óptica y aprovisionamiento.',incidents:'Registra y da seguimiento a incidencias de tus clientes.',technicians:'Organiza técnicos, cuadrillas y órdenes de trabajo.',billing:'Consulta y administra los ciclos de facturación.',payments:'Registra y consulta los pagos de tus abonados.',debts:'Identifica cuentas vencidas y saldos pendientes.',inventory:'Controla equipos, materiales y movimientos de almacén.',reports:'Indicadores de operación, ventas y recaudación.',settings:'Configura los datos de tu operador y las preferencias del sistema.'};return <><div className="welcome"><div><div className="eyebrow"><span className="live-dot"/> GESTIÓN DEL OPERADOR</div><h1>{pageTitles[active]}</h1><p>{desc[active]}</p></div>{['clients','payments','billing','incidents'].includes(active)&&<button className="primary-button" onClick={()=>active==='clients'?setShowAdd(true):setNotice('Este formulario estará disponible en la siguiente etapa')}><Plus size={17}/> Nuevo registro</button>}</div><div className="panel coming-panel"><div className="coming-icon"><Cable size={28}/></div><h2>{pageTitles[active]}</h2><p>Este módulo ya está contemplado en la arquitectura de GABOT CLOUD FTTH. Estamos preparando su conexión con datos reales y permisos por usuario.</p><div className="coming-tags"><span>Diseño adaptable</span><span>Gestión centralizada</span><span>Auditoría de cambios</span></div></div></>}

  return <div className="app-shell"><Sidebar/>{mobileOpen&&<div className="scrim" onClick={()=>setMobileOpen(false)}/>}<main className="main-content"><header className="topbar"><button className="menu-toggle" onClick={()=>setMobileOpen(true)}><Menu size={21}/></button><div className="breadcrumbs">GABOT CLOUD <ChevronRight size={14}/><b>{pageTitles[active]}</b></div><div className="top-actions"><div className="system-online"><i/> Sistema en línea</div><button className="icon-button notification"><Bell size={18}/><i/></button><div className="top-user"><div className="avatar">GB</div><div><b>{user?.name||'Administrador'}</b><small>{user?.role||'Usuario'}</small></div><ChevronDown size={14}/></div></div></header><div className="page-content">{active==='dashboard'?<Dashboard/>:active==='clients'?<><div className="welcome"><div><div className="eyebrow"><span className="live-dot"/> BASE DE DATOS NEON · DATOS EN VIVO</div><h1>Clientes</h1><p>Administra los abonados y consulta el estado de sus cuentas.</p></div><button className="primary-button" onClick={()=>setShowAdd(true)}><Plus size={17}/> Nuevo cliente</button></div><div className="stats-grid compact"><Stat label="Total de clientes" value={clients.length} sub="+1" icon={Users} tone="blue"/><Stat label="Activos" value={clients.filter(c=>c.status==='Activo').length} sub="—" icon={Wifi} tone="green"/><Stat label="Con deuda" value={clients.filter(c=>c.status==='Deuda').length} sub="—" icon={Wallet} tone="orange"/><Stat label="Suspendidos" value={clients.filter(c=>c.status==='Suspendido').length} sub="—" icon={ShieldCheck} tone="violet"/></div><section className="panel table-panel"><div className="panel-heading"><div><h2>Directorio de clientes</h2><p>{loadingClients?'Cargando desde Neon...':filtered.length+' registros encontrados'}</p></div><div className="table-actions"><label className="search-box"><Search size={16}/><input placeholder="Buscar cliente..." value={query} onChange={e=>setQuery(e.target.value)}/></label><button className="outline-button" onClick={()=>setNotice('La exportación CSV estará disponible al conectar la base de datos')}><Download size={16}/> Exportar</button></div></div>{clientError&&<p className="client-error">{clientError}</p>}<ClientTable rows={filtered}/></section></>:<GenericPage/>}</div><footer className="footer"><span>© 2026 GABOT CLOUD FTTH</span><span>Plataforma de gestión para operadores de fibra óptica</span><span>Versión 1.0.0 · Inicial</span></footer></main>
    {showAdd&&<div className="modal-backdrop" onClick={()=>setShowAdd(false)}><form className="modal" onSubmit={addClient} onClick={e=>e.stopPropagation()}><div className="modal-head"><div><h2>Registrar cliente</h2><p>Los datos se guardarán en Neon.</p></div><button type="button" className="icon-button" onClick={()=>setShowAdd(false)}><X size={19}/></button></div><label>Nombre del cliente<input autoFocus value={newName} onChange={e=>setNewName(e.target.value)} placeholder="Ej. Juan Pérez" required minLength={2}/></label><label>Documento<input value={newDocument} onChange={e=>setNewDocument(e.target.value)} placeholder="DNI o RUC"/></label><label>Correo electrónico<input type="email" value={newEmail} onChange={e=>setNewEmail(e.target.value)} placeholder="cliente@correo.com"/></label><label>Teléfono<input value={newPhone} onChange={e=>setNewPhone(e.target.value)} placeholder="999 999 999"/></label><label>Dirección<input value={newAddress} onChange={e=>setNewAddress(e.target.value)} placeholder="Dirección del abonado"/></label><label>Zona / distrito<input value={newZone} onChange={e=>setNewZone(e.target.value)} placeholder="Ej. Breña"/></label><label>Notas<input value={newNotes} onChange={e=>setNewNotes(e.target.value)} placeholder="Observaciones (opcional)"/></label><div className="modal-actions"><button type="button" className="outline-button" onClick={()=>setShowAdd(false)}>Cancelar</button><button className="primary-button" type="submit"><Plus size={16}/> Guardar cliente</button></div></form></div>}
    {notice&&<div className="toast"><Check size={17}/>{notice}<button onClick={()=>setNotice('')}><X size={15}/></button></div>}
  </div>
}
export default App;
