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
  const [dashboardSummary,setDashboardSummary]=useState(null);
  const [dashboardError,setDashboardError]=useState('');
  const [plans,setPlans]=useState([]);
  const [subscriptions,setSubscriptions]=useState([]);
  const [moduleError,setModuleError]=useState('');
  const [showPlanForm,setShowPlanForm]=useState(false);
  const [showServiceForm,setShowServiceForm]=useState(false);
  const [planName,setPlanName]=useState('');
  const [planDown,setPlanDown]=useState('100');
  const [planUp,setPlanUp]=useState('50');
  const [planPrice,setPlanPrice]=useState('');
  const [serviceCustomer,setServiceCustomer]=useState('');
  const [servicePlan,setServicePlan]=useState('');
  const [serviceStatus,setServiceStatus]=useState('PENDING');
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

  useEffect(()=>{
    if(!token||!user)return;
    const controller=new AbortController();
    setDashboardError('');
    fetch('/api/dashboard/summary',{headers:{Authorization:'Bearer '+token},signal:controller.signal})
      .then(async r=>{const data=await r.json().catch(()=>({}));if(!r.ok)throw new Error(data.error||'No se pudo cargar el resumen');return data;})
      .then(data=>setDashboardSummary(data))
      .catch(error=>{if(error.name!=='AbortError')setDashboardError(error.message);});
    return ()=>controller.abort();
  },[token,user,refreshKey]);

  useEffect(()=>{
    if(!token||!user)return;
    const controller=new AbortController();
    Promise.all([
      fetch('/api/plans',{headers:{Authorization:'Bearer '+token},signal:controller.signal}).then(async r=>{const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||'Error al cargar planes');return d;}),
      fetch('/api/subscriptions',{headers:{Authorization:'Bearer '+token},signal:controller.signal}).then(async r=>{const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||'Error al cargar servicios');return d;})
    ]).then(([p,s])=>{setPlans(p.items||[]);setSubscriptions(s.items||[]);setModuleError('');})
      .catch(e=>{if(e.name!=='AbortError')setModuleError(e.message);});
    return ()=>controller.abort();
  },[token,user,refreshKey]);

  async function savePlan(e){
    e.preventDefault();setModuleError('');
    try{
      const r=await fetch('/api/plans',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify({name:planName.trim(),speedDown:Number(planDown),speedUp:Number(planUp),price:Number(planPrice),currency:'PEN'})});
      const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||'No se pudo guardar el plan');
      setShowPlanForm(false);setPlanName('');setPlanPrice('');setRefreshKey(v=>v+1);setNotice('Plan guardado en Neon');
    }catch(e){setModuleError(e.message);}
  }

  async function saveService(e){
    e.preventDefault();setModuleError('');
    try{
      const r=await fetch('/api/subscriptions',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify({customerId:serviceCustomer,planId:servicePlan,status:serviceStatus})});
      const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||'No se pudo asignar el servicio');
      setShowServiceForm(false);setServiceCustomer('');setServicePlan('');setRefreshKey(v=>v+1);setNotice('Servicio asignado en Neon');
    }catch(e){setModuleError(e.message);}
  }

  async function updateServiceStatus(id,status){
    try{const r=await fetch('/api/subscriptions/'+id+'/status',{method:'PATCH',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify({status})});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||'No se pudo cambiar el estado');setRefreshKey(v=>v+1);setNotice('Estado actualizado');}
    catch(e){setModuleError(e.message);}
  }

  async function updatePlanStatus(id,active){
    try{const r=await fetch('/api/plans/'+id+'/status',{method:'PATCH',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify({active})});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||'No se pudo cambiar el plan');setRefreshKey(v=>v+1);setNotice('Plan actualizado');}
    catch(e){setModuleError(e.message);}
  }

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

  const Stat=({label,value,sub,icon:Icon,tone})=><div className="stat-card"><div className="stat-top"><span>{label}</span><div className={'stat-icon '+tone}><Icon size={19}/></div></div><strong>{value}</strong><div className="stat-foot"><span className="trend"><Activity size={13}/>{sub}</span><span>Datos de Neon</span></div></div>;

  function Dashboard(){return <>
    <div className="welcome"><div><div className="eyebrow"><span className="live-dot"/> SISTEMA OPERATIVO</div><h1>Panel principal</h1><p>Bienvenido a tu centro de control de internet por fibra óptica.</p></div><button className="date-pill"><Activity size={15}/> Vista general <ChevronDown size={14}/></button></div>
    <div className="stats-grid">
      <Stat label="Clientes registrados" value={Number(dashboardSummary?.customers||0).toLocaleString('es-PE')} sub="Total en la base de datos" icon={Users} tone="blue"/>
      <Stat label="Servicios activos" value={Number(dashboardSummary?.activeSubscriptions||0).toLocaleString('es-PE')} sub="Suscripciones activas" icon={Wifi} tone="green"/>
      <Stat label="Pagos del mes" value={'S/ '+Number(dashboardSummary?.monthlyPayments||0).toLocaleString('es-PE',{minimumFractionDigits:2,maximumFractionDigits:2})} sub="Pagos registrados este mes" icon={CircleDollarSign} tone="violet"/>
      <Stat label="Saldo pendiente" value={'S/ '+Number(dashboardSummary?.pendingBalance||0).toLocaleString('es-PE',{minimumFractionDigits:2,maximumFractionDigits:2})} sub={Number(dashboardSummary?.pendingInvoices||0)+' facturas por cobrar'} icon={Wallet} tone="orange"/>
      {dashboardError&&<p className="client-error">{dashboardError}</p>}
    </div>
    <div className="main-grid">
      <section className="panel network-panel"><div className="panel-heading"><div><h2>Estado de la red</h2><p>Resumen de infraestructura FTTH</p></div><span className="status-chip"><i/> Operativa</span></div><div className="network-visual"><div className="network-orbit orbit-one"/><div className="network-orbit orbit-two"/><div className="network-core"><Network size={27}/><b>RED FTTH</b><small>Infraestructura registrada</small></div><div className="node node-a"><Router size={17}/><small>Equipos activos</small><b>{Number(dashboardSummary?.registeredEquipment||0)}</b></div></div><div className="network-legend"><span><i className="gray-dot"/> Estado operativo: sin monitoreo conectado</span></div></section>
      <section className="panel"><div className="panel-heading"><div><h2>Actividad reciente</h2><p>Últimos movimientos del sistema</p></div><button className="icon-button"><ChevronRight size={17}/></button></div><div className="activity-list"><div className="activity-item"><div className="activity-symbol blue"><Activity size={16}/></div><div><b>Registro de actividad</b><p>Los movimientos reales aparecerán aquí cuando se conecte el historial de auditoría.</p><small>Sin eventos consultables por ahora</small></div></div></div></section>
    </div>
    <section className="panel table-panel"><div className="panel-heading"><div><h2>Clientes recientes</h2><p>Vista rápida de tu cartera de clientes</p></div><button className="text-button" onClick={()=>setActive('clients')}>Ver todos <ChevronRight size={15}/></button></div><ClientTable rows={clients.slice(0,4)}/></section>
  </>}

  function ClientTable({rows}){return <div className="table-wrap"><table><thead><tr><th>CLIENTE</th><th>PLAN</th><th>ZONA</th><th>ESTADO</th><th>SALDO</th></tr></thead><tbody>{rows.map(c=><tr key={c.id}><td><div className="client-cell"><div className="client-avatar">{c.name.slice(0,1).toUpperCase()}</div><div><b>{c.name}</b><small>{c.id}</small></div></div></td><td>{c.plan}</td><td>{c.zone}</td><td><span className={'badge '+(c.status==='Activo'?'badge-green':c.status==='Deuda'?'badge-orange':c.status==='Suspendido'?'badge-red':'badge-blue')}>{c.status}</span></td><td className="amount">{c.balance}</td></tr>)}</tbody></table>{rows.length===0&&<div className="empty">No se encontraron clientes.</div>}</div>}

  function PlansPage(){return <>
    <div className="welcome"><div><div className="eyebrow"><span className="live-dot"/> BASE DE DATOS NEON · DATOS EN VIVO</div><h1>Planes de internet</h1><p>Configura velocidades, precios y disponibilidad.</p></div><button className="primary-button" onClick={()=>setShowPlanForm(true)}><Plus size={17}/> Nuevo plan</button></div>
    {moduleError&&<p className="client-error">{moduleError}</p>}
    <div className="stats-grid compact"><Stat label="Planes registrados" value={plans.length} sub="En Neon" icon={Wifi} tone="blue"/><Stat label="Disponibles" value={plans.filter(p=>p.active).length} sub="Activos" icon={Check} tone="green"/><Stat label="Clientes" value={clients.length} sub="En directorio" icon={Users} tone="violet"/><Stat label="Servicios" value={subscriptions.length} sub="Asignados" icon={Signal} tone="orange"/></div>
    <section className="panel table-panel"><div className="panel-heading"><div><h2>Catálogo de planes</h2><p>{plans.length} planes registrados</p></div></div><div className="table-wrap"><table><thead><tr><th>PLAN</th><th>DESCARGA</th><th>SUBIDA</th><th>PRECIO</th><th>ESTADO</th><th>ACCIÓN</th></tr></thead><tbody>{plans.map(p=><tr key={p.id}><td>{p.name}</td><td>{p.speedDown} Mbps</td><td>{p.speedUp} Mbps</td><td className="amount">S/ {Number(p.price).toFixed(2)}</td><td>{p.active?'Disponible':'Inactivo'}</td><td><button className="outline-button" onClick={()=>updatePlanStatus(p.id,!p.active)}>{p.active?'Desactivar':'Activar'}</button></td></tr>)}</tbody></table>{!plans.length&&<div className="empty">Todavía no hay planes registrados.</div>}</div></section>
  </>}

  function ServicesPage(){const names={ACTIVE:'Activo',PENDING:'Pendiente',SUSPENDED:'Suspendido',INACTIVE:'Inactivo'};return <>
    <div className="welcome"><div><div className="eyebrow"><span className="live-dot"/> BASE DE DATOS NEON · DATOS EN VIVO</div><h1>Servicios activos</h1><p>Asigna planes a tus clientes y administra sus conexiones.</p></div><button className="primary-button" onClick={()=>setShowServiceForm(true)} disabled={!clients.length||!plans.some(p=>p.active)}><Plus size={17}/> Asignar servicio</button></div>
    {moduleError&&<p className="client-error">{moduleError}</p>}
    <div className="stats-grid compact"><Stat label="Servicios" value={subscriptions.length} sub="Registrados" icon={Signal} tone="blue"/><Stat label="Activos" value={subscriptions.filter(x=>x.status==='ACTIVE').length} sub="Con conexión activa" icon={Wifi} tone="green"/><Stat label="Pendientes" value={subscriptions.filter(x=>x.status==='PENDING').length} sub="Por instalar" icon={Activity} tone="orange"/><Stat label="Suspendidos" value={subscriptions.filter(x=>x.status==='SUSPENDED').length} sub="Suspendidos" icon={ShieldCheck} tone="violet"/></div>
    <section className="panel table-panel"><div className="panel-heading"><div><h2>Servicios registrados</h2><p>{subscriptions.length} servicios en Neon</p></div></div><div className="table-wrap"><table><thead><tr><th>CLIENTE</th><th>PLAN</th><th>VELOCIDAD</th><th>PRECIO</th><th>ESTADO</th><th>CAMBIAR</th></tr></thead><tbody>{subscriptions.map(x=><tr key={x.id}><td>{x.customer.name}</td><td>{x.plan.name}</td><td>{x.plan.speedDown}/{x.plan.speedUp} Mbps</td><td>S/ {Number(x.plan.price).toFixed(2)}</td><td>{names[x.status]||x.status}</td><td><select className="status-select" value={x.status} onChange={e=>updateServiceStatus(x.id,e.target.value)}><option value="PENDING">Pendiente</option><option value="ACTIVE">Activo</option><option value="SUSPENDED">Suspendido</option><option value="INACTIVE">Inactivo</option></select></td></tr>)}</tbody></table>{!subscriptions.length&&<div className="empty">Todavía no hay servicios. Registra clientes y planes primero.</div>}</div></section>
  </>}

  function GenericPage(){const desc={plans:'Administra velocidades, precios y condiciones comerciales.',services:'Supervisa el estado de las conexiones de tus abonados.',network:'Administra equipos OLT Huawei, ZTE y VSOL.',onus:'Controla ONT/ONU, seriales, señal óptica y aprovisionamiento.',incidents:'Registra y da seguimiento a incidencias de tus clientes.',technicians:'Organiza técnicos, cuadrillas y órdenes de trabajo.',billing:'Consulta y administra los ciclos de facturación.',payments:'Registra y consulta los pagos de tus abonados.',debts:'Identifica cuentas vencidas y saldos pendientes.',inventory:'Controla equipos, materiales y movimientos de almacén.',reports:'Indicadores de operación, ventas y recaudación.',settings:'Configura los datos de tu operador y las preferencias del sistema.'};return <><div className="welcome"><div><div className="eyebrow"><span className="live-dot"/> GESTIÓN DEL OPERADOR</div><h1>{pageTitles[active]}</h1><p>{desc[active]}</p></div>{['clients','payments','billing','incidents'].includes(active)&&<button className="primary-button" onClick={()=>active==='clients'?setShowAdd(true):setNotice('Este formulario estará disponible en la siguiente etapa')}><Plus size={17}/> Nuevo registro</button>}</div><div className="panel coming-panel"><div className="coming-icon"><Cable size={28}/></div><h2>{pageTitles[active]}</h2><p>Este módulo ya está contemplado en la arquitectura de GABOT CLOUD FTTH. Estamos preparando su conexión con datos reales y permisos por usuario.</p><div className="coming-tags"><span>Diseño adaptable</span><span>Gestión centralizada</span><span>Auditoría de cambios</span></div></div></>}

  return <div className="app-shell"><Sidebar/>{mobileOpen&&<div className="scrim" onClick={()=>setMobileOpen(false)}/>}<main className="main-content"><header className="topbar"><button className="menu-toggle" onClick={()=>setMobileOpen(true)}><Menu size={21}/></button><div className="breadcrumbs">GABOT CLOUD <ChevronRight size={14}/><b>{pageTitles[active]}</b></div><div className="top-actions"><div className="system-online"><i/> Sistema en línea</div><button className="icon-button notification"><Bell size={18}/><i/></button><div className="top-user"><div className="avatar">GB</div><div><b>{user?.name||'Administrador'}</b><small>{user?.role||'Usuario'}</small></div><ChevronDown size={14}/></div></div></header><div className="page-content">{active==='dashboard'?<Dashboard/>:active==='plans'?<PlansPage/>:active==='services'?<ServicesPage/>:active==='clients'?<><div className="welcome"><div><div className="eyebrow"><span className="live-dot"/> BASE DE DATOS NEON · DATOS EN VIVO</div><h1>Clientes</h1><p>Administra los abonados y consulta el estado de sus cuentas.</p></div><button className="primary-button" onClick={()=>setShowAdd(true)}><Plus size={17}/> Nuevo cliente</button></div><div className="stats-grid compact"><Stat label="Total de clientes" value={clients.length} sub="+1" icon={Users} tone="blue"/><Stat label="Activos" value={clients.filter(c=>c.status==='Activo').length} sub="—" icon={Wifi} tone="green"/><Stat label="Con deuda" value={clients.filter(c=>c.status==='Deuda').length} sub="—" icon={Wallet} tone="orange"/><Stat label="Suspendidos" value={clients.filter(c=>c.status==='Suspendido').length} sub="—" icon={ShieldCheck} tone="violet"/></div><section className="panel table-panel"><div className="panel-heading"><div><h2>Directorio de clientes</h2><p>{loadingClients?'Cargando desde Neon...':filtered.length+' registros encontrados'}</p></div><div className="table-actions"><label className="search-box"><Search size={16}/><input placeholder="Buscar cliente..." value={query} onChange={e=>setQuery(e.target.value)}/></label><button className="outline-button" onClick={()=>setNotice('La exportación CSV estará disponible al conectar la base de datos')}><Download size={16}/> Exportar</button></div></div>{clientError&&<p className="client-error">{clientError}</p>}<ClientTable rows={filtered}/></section></>:<GenericPage/>}</div><footer className="footer"><span>© 2026 GABOT CLOUD FTTH</span><span>Plataforma de gestión para operadores de fibra óptica</span><span>Versión 1.0.0 · Inicial</span></footer></main>
    {showPlanForm&&<div className="modal-backdrop" onClick={()=>setShowPlanForm(false)}><form className="modal" onSubmit={savePlan} onClick={e=>e.stopPropagation()}><div className="modal-head"><div><h2>Nuevo plan</h2><p>Se guardará en Neon.</p></div><button type="button" className="icon-button" onClick={()=>setShowPlanForm(false)}><X size={19}/></button></div><label>Nombre<input value={planName} onChange={e=>setPlanName(e.target.value)} required minLength={2} placeholder="Fibra 200 Mbps"/></label><label>Descarga Mbps<input type="number" min="1" value={planDown} onChange={e=>setPlanDown(e.target.value)} required/></label><label>Subida Mbps<input type="number" min="1" value={planUp} onChange={e=>setPlanUp(e.target.value)} required/></label><label>Precio mensual S/<input type="number" min="0" step="0.01" value={planPrice} onChange={e=>setPlanPrice(e.target.value)} required/></label><div className="modal-actions"><button type="button" className="outline-button" onClick={()=>setShowPlanForm(false)}>Cancelar</button><button className="primary-button">Guardar plan</button></div></form></div>}
    {showServiceForm&&<div className="modal-backdrop" onClick={()=>setShowServiceForm(false)}><form className="modal" onSubmit={saveService} onClick={e=>e.stopPropagation()}><div className="modal-head"><div><h2>Asignar servicio</h2><p>Selecciona cliente y plan.</p></div><button type="button" className="icon-button" onClick={()=>setShowServiceForm(false)}><X size={19}/></button></div><label>Cliente<select value={serviceCustomer} onChange={e=>setServiceCustomer(e.target.value)} required><option value="">Selecciona cliente</option>{clients.map(c=><option key={c.dbId} value={c.dbId}>{c.name} · {c.id}</option>)}</select></label><label>Plan<select value={servicePlan} onChange={e=>setServicePlan(e.target.value)} required><option value="">Selecciona plan</option>{plans.filter(p=>p.active).map(p=><option key={p.id} value={p.id}>{p.name} · {p.speedDown} Mbps</option>)}</select></label><label>Estado inicial<select value={serviceStatus} onChange={e=>setServiceStatus(e.target.value)}><option value="PENDING">Pendiente</option><option value="ACTIVE">Activo</option></select></label><div className="modal-actions"><button type="button" className="outline-button" onClick={()=>setShowServiceForm(false)}>Cancelar</button><button className="primary-button">Asignar servicio</button></div></form></div>}
    {showAdd&&<div className="modal-backdrop" onClick={()=>setShowAdd(false)}><form className="modal" onSubmit={addClient} onClick={e=>e.stopPropagation()}><div className="modal-head"><div><h2>Registrar cliente</h2><p>Los datos se guardarán en Neon.</p></div><button type="button" className="icon-button" onClick={()=>setShowAdd(false)}><X size={19}/></button></div><label>Nombre del cliente<input autoFocus value={newName} onChange={e=>setNewName(e.target.value)} placeholder="Ej. Juan Pérez" required minLength={2}/></label><label>Documento<input value={newDocument} onChange={e=>setNewDocument(e.target.value)} placeholder="DNI o RUC"/></label><label>Correo electrónico<input type="email" value={newEmail} onChange={e=>setNewEmail(e.target.value)} placeholder="cliente@correo.com"/></label><label>Teléfono<input value={newPhone} onChange={e=>setNewPhone(e.target.value)} placeholder="999 999 999"/></label><label>Dirección<input value={newAddress} onChange={e=>setNewAddress(e.target.value)} placeholder="Dirección del abonado"/></label><label>Zona / distrito<input value={newZone} onChange={e=>setNewZone(e.target.value)} placeholder="Ej. Breña"/></label><label>Notas<input value={newNotes} onChange={e=>setNewNotes(e.target.value)} placeholder="Observaciones (opcional)"/></label><div className="modal-actions"><button type="button" className="outline-button" onClick={()=>setShowAdd(false)}>Cancelar</button><button className="primary-button" type="submit"><Plus size={16}/> Guardar cliente</button></div></form></div>}
    {notice&&<div className="toast"><Check size={17}/>{notice}<button onClick={()=>setNotice('')}><X size={15}/></button></div>}
  </div>
}
export default App;
