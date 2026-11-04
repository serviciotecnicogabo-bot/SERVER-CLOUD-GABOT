import { useCallback, useEffect, useState } from 'react';
import { Plus, RefreshCw, ShieldCheck, UserRound, UserX, X } from 'lucide-react';

const roles = [
  ['ADMIN', 'Administrador'],
  ['BILLING', 'Facturación'],
  ['SUPPORT', 'Atención al cliente'],
  ['TECHNICIAN', 'Técnico'],
];
const roleNames = { OWNER: 'Propietario', ...Object.fromEntries(roles.map(([key, label]) => [key, label])) };

export default function UsersPage({ token, user }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'SUPPORT' });

  const request = useCallback(async (path, options = {}) => {
    const response = await fetch('/api/users' + path, {
      ...options,
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token, ...(options.headers || {}) },
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'No se pudo completar la operación.');
    return data;
  }, [token]);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try { const data = await request(''); setItems(data.items || []); }
    catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }, [request]);

  useEffect(() => { load(); }, [load]);

  async function createUser(e) {
    e.preventDefault(); setSaving(true); setError('');
    try {
      await request('', { method: 'POST', body: JSON.stringify(form) });
      setForm({ name: '', email: '', password: '', role: 'SUPPORT' });
      setShowForm(false); setNotice('Usuario creado correctamente.'); await load();
    } catch (e) { setError(e.message); }
    finally { setSaving(false); }
  }

  async function changeUser(id, patch) {
    setError(''); setNotice('');
    try { await request('/' + encodeURIComponent(id), { method: 'PATCH', body: JSON.stringify(patch) }); setNotice('Cambios guardados.'); await load(); }
    catch (e) { setError(e.message); }
  }

  if (!['OWNER', 'ADMIN'].includes(user?.role)) {
    return <section className="panel coming-panel"><ShieldCheck size={30}/><h2>Acceso restringido</h2><p>Solo el propietario o un administrador pueden gestionar las cuentas del personal.</p></section>;
  }

  return <div className="users-page">
    <div className="welcome"><div><div className="eyebrow"><span className="live-dot"/> SEGURIDAD Y ACCESOS</div><h1>Usuarios y permisos</h1><p>Administra las cuentas del personal de tu empresa.</p></div><div className="table-actions"><button className="outline-button" onClick={load} disabled={loading}><RefreshCw size={15}/> Actualizar</button><button className="primary-button" onClick={() => setShowForm(true)}><Plus size={16}/> Nuevo usuario</button></div></div>
    <div className="stats-grid compact"><div className="stat-card"><div className="stat-top">Usuarios registrados</div><strong>{items.length}</strong><div className="stat-foot">En esta empresa</div></div><div className="stat-card"><div className="stat-top">Cuentas activas</div><strong>{items.filter(x => x.active).length}</strong><div className="stat-foot">Con acceso habilitado</div></div><div className="stat-card"><div className="stat-top">Propietarios</div><strong>{items.filter(x => x.role === 'OWNER' && x.active).length}</strong><div className="stat-foot">Responsables de la empresa</div></div></div>
    {error && <p className="client-error">{error}</p>}{notice && <p className="integration-success">{notice}</p>}
    <section className="panel table-panel"><div className="panel-heading"><div><h2>Personal de la empresa</h2><p>{loading ? 'Cargando usuarios...' : items.length + ' cuentas registradas'}</p></div></div><div className="table-wrap"><table><thead><tr><th>Usuario</th><th>Correo</th><th>Rol</th><th>Estado</th><th>Acciones</th></tr></thead><tbody>{items.map(item => {
      const isSelf = item.id === user?.id;
      const canManage = user?.role === 'OWNER' || item.role !== 'OWNER';
      return <tr key={item.id}><td><div className="client-cell"><b>{item.name}</b><small>{isSelf ? 'Tu cuenta' : 'Personal'}</small></div></td><td>{item.email}</td><td>{roleNames[item.role] || item.role}</td><td><span className={'status-chip ' + (item.active ? 'status-active' : '')}>{item.active ? 'Activo' : 'Inactivo'}</span></td><td>{canManage && !isSelf && item.role !== 'OWNER' ? <div className="table-actions"><select className="status-select" value={item.role} onChange={e => changeUser(item.id, { role: e.target.value })} aria-label={'Rol de ' + item.name}>{roles.filter(([key]) => user?.role === 'OWNER' || key !== 'ADMIN').map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select><button className="outline-button" onClick={() => changeUser(item.id, { active: !item.active })}>{item.active ? <><UserX size={14}/> Desactivar</> : <><UserRound size={14}/> Activar</>}</button></div> : <span className="muted">{isSelf ? 'Sesión actual' : 'Protegido'}</span>}</td></tr>;
    })}</tbody></table>{!loading && !items.length && <div className="empty">Todavía no hay usuarios adicionales.</div>}</div></section>
    {showForm && <div className="modal-backdrop" onClick={() => setShowForm(false)}><form className="modal" onSubmit={createUser} onClick={e => e.stopPropagation()}><div className="modal-head"><div><h2>Crear usuario</h2><p>La cuenta pertenecerá a tu empresa.</p></div><button type="button" className="icon-button" onClick={() => setShowForm(false)}><X size={18}/></button></div><label>Nombre completo<input minLength={2} maxLength={120} required value={form.name} onChange={e => setForm(v => ({ ...v, name: e.target.value }))}/></label><label>Correo electrónico<input type="email" required value={form.email} onChange={e => setForm(v => ({ ...v, email: e.target.value }))}/></label><label>Contraseña inicial<input type="password" minLength={12} required value={form.password} onChange={e => setForm(v => ({ ...v, password: e.target.value }))}/><small>Usa al menos 12 caracteres. No reutilices la contraseña del propietario.</small></label><label>Rol<select value={form.role} onChange={e => setForm(v => ({ ...v, role: e.target.value }))}>{roles.filter(([key]) => user?.role === 'OWNER' || key !== 'ADMIN').map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>{error && <p className="client-error">{error}</p>}<div className="modal-actions"><button type="button" className="outline-button" onClick={() => setShowForm(false)}>Cancelar</button><button className="primary-button" disabled={saving}>{saving ? 'Creando...' : 'Crear usuario'}</button></div></form></div>}
  </div>;
}
