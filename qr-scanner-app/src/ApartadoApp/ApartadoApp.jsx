import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Building2, CheckCircle, Wifi, WifiOff, Sun, Moon, ArrowLeft,
  AlertTriangle, Loader2, DollarSign, Home, Hash, Users,
  TrendingUp, FileCheck, Search, ChevronDown, X, RefreshCw,
} from 'lucide-react';
import './ApartadoApp.css';

// ─── CONFIG ───────────────────────────────────────────────────────────────────
const API_BASE = 'https://grupo-veq-n8n-grupo-veq.adsfsj.easypanel.host/webhook';
const ENDPOINTS = {
  catalogo: `${API_BASE}/apartado/catalogo`,
  verificar: `${API_BASE}/apartado/verificar`,
  confirmar: `${API_BASE}/apartado/confirmar`,
};

// ─── HELPERS ──────────────────────────────────────────────────────────────────
const fmt = (n) =>
  new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(Number(n) || 0);

const parseUrlParams = () => {
  const p = new URLSearchParams(window.location.search);
  return {
    invitadoId: p.get('invitadoId') || p.get('invitado') || null,
    oppId: p.get('oppId') || p.get('opp') || null,
    token: p.get('token') || null,
    eventId: p.get('eventId') || p.get('evento') || null,
  };
};

// ─── COMPONENT ────────────────────────────────────────────────────────────────
const ApartadoApp = () => {
  const [urlParams] = useState(parseUrlParams);
  const [screen, setScreen] = useState('catalogo');

  // Datos reales de SF vía n8n
  const [inventario, setInventario] = useState([]);
  const [proyectos, setProyectos] = useState([]);
  const [contexto, setContexto] = useState(null);
  const [contador, setContador] = useState(null);
  const [unidadSel, setUnidadSel] = useState(null);
  const [operacion, setOperacion] = useState(null);

  // Filtros (acumulables: los 3 se combinan con AND, multi-select dentro de cada uno)
  const [proyectosSel, setProyectosSel] = useState([]);   // array de objetos {id, nombre}
  const [categoriasSel, setCategoriasSel] = useState([]); // array de strings
  const [nombreQuery, setNombreQuery] = useState('');
  const [proyectoDropdownOpen, setProyectoDropdownOpen] = useState(false);
  const [categoriaDropdownOpen, setCategoriaDropdownOpen] = useState(false);
  const [sugerenciasOpen, setSugerenciasOpen] = useState(false);
  const proyectoDropdownRef = useRef(null);
  const categoriaDropdownRef = useRef(null);
  const sugerenciasRef = useRef(null);

  // Formulario
  const [form, setForm] = useState({
    precioVenta: '', montoApartado: '',
    enganche: '', financiamiento: '', entrega: '',
    mensualidades: '', fechaMensualidad: '',
  });

  // UI
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [theme, setTheme] = useState(() => localStorage.getItem('veq-theme') || 'light');

  useEffect(() => {
    localStorage.setItem('veq-theme', theme);
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  useEffect(() => {
    const up = () => setIsOnline(true);
    const down = () => setIsOnline(false);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    return () => { window.removeEventListener('online', up); window.removeEventListener('offline', down); };
  }, []);

  useEffect(() => {
    const handler = (e) => {
      if (proyectoDropdownRef.current && !proyectoDropdownRef.current.contains(e.target))
        setProyectoDropdownOpen(false);
      if (categoriaDropdownRef.current && !categoriaDropdownRef.current.contains(e.target))
        setCategoriaDropdownOpen(false);
      if (sugerenciasRef.current && !sugerenciasRef.current.contains(e.target))
        setSugerenciasOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // ── Cargar catálogo desde n8n → SF ─────────────────────────────────────────
  const cargarCatalogo = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(ENDPOINTS.catalogo, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          invitadoId: urlParams.invitadoId,
          oppId: urlParams.oppId,
          token: urlParams.token,
          eventId: urlParams.eventId,
        }),
      });

      if (!res.ok) throw new Error(`El servidor respondió con error ${res.status}`);

      const data = await res.json();
      const unidades = data.unidades || [];

      // Derivar proyectos únicos si n8n no los manda separados
      let proyectosArr = data.proyectos || [];
      if (proyectosArr.length === 0 && unidades.length > 0) {
        const map = {};
        for (const u of unidades) {
          if (u.proyectoId && !map[u.proyectoId])
            map[u.proyectoId] = { id: u.proyectoId, nombre: u.proyectoNombre || u.proyectoId };
        }
        proyectosArr = Object.values(map).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
      }

      setInventario(unidades);
      setProyectos(proyectosArr);
      setContexto(data.contexto || null);
      setContador(data.contador || null);

    } catch (err) {
      // Mensaje de error claro según el tipo de fallo
      if (err.message.includes('Failed to fetch') || err.message.includes('NetworkError')) {
        setError(
          'No se pudo conectar con el servidor. Verifica que:\n' +
          '1. El workflow en n8n esté activo (toggle "Active" en azul)\n' +
          '2. El webhook /apartado/catalogo esté en modo Production\n' +
          '3. No haya bloqueo de CORS en n8n (habilita "Allow OPTIONS method" en el nodo webhook)'
        );
      } else {
        setError(`Error al cargar el inventario: ${err.message}`);
      }
    } finally {
      setLoading(false);
    }
  }, [urlParams]);

  useEffect(() => { cargarCatalogo(); }, [cargarCatalogo]);

  // ── Derived: filtrado (acumulable AND, multi-select por filtro) ──────────────
  // Categorías únicas derivadas del inventario (campo "tipo" = familia de SF)
  const categorias = Array.from(
    new Set(inventario.map((u) => u.tipo).filter(Boolean))
  ).sort((a, b) => a.localeCompare(b, 'es'));

  // Sugerencias de nombre (mientras el usuario teclea)
  const nombresDisponibles = Array.from(
    new Set(inventario.map((u) => u.nombre).filter(Boolean))
  );
  const sugerenciasNombre = nombreQuery.trim()
    ? nombresDisponibles
      .filter((n) => n.toLowerCase().includes(nombreQuery.toLowerCase()))
      .slice(0, 8)
    : [];

  // Aplicar TODOS los filtros activos (AND)
  const proyectoIdsSel = proyectosSel.map((p) => p.id);
  const nombreQ = nombreQuery.toLowerCase().trim();

  const inventarioFiltrado = inventario.filter((u) => {
    if (proyectosSel.length > 0 && !proyectoIdsSel.includes(u.proyectoId)) return false;
    if (categoriasSel.length > 0 && !categoriasSel.includes(u.tipo)) return false;
    if (nombreQ && !(u.nombre || '').toLowerCase().includes(nombreQ)) return false;
    return true;
  });

  // Toggle helpers para multi-select
  const toggleProyecto = (p) => {
    setProyectosSel((prev) =>
      prev.some((x) => x.id === p.id)
        ? prev.filter((x) => x.id !== p.id)
        : [...prev, p]
    );
  };
  const toggleCategoria = (cat) => {
    setCategoriasSel((prev) =>
      prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat]
    );
  };

  const limpiarTodo = () => {
    setProyectosSel([]);
    setCategoriasSel([]);
    setNombreQuery('');
    setProyectoDropdownOpen(false);
    setCategoriaDropdownOpen(false);
    setSugerenciasOpen(false);
  };

  const totalFiltrosActivos =
    proyectosSel.length + categoriasSel.length + (nombreQ ? 1 : 0);

  // ── Formulario ───────────────────────────────────────────────────────────────
  const seleccionarUnidad = (u) => {
    setUnidadSel(u);
    setForm({
      precioVenta: String(u.precio || ''), montoApartado: String(u.montoApartado || ''),
      enganche: '', financiamiento: '', entrega: '', mensualidades: '', fechaMensualidad: '',
    });
    setScreen('formulario');
    setError(null);
  };

  const totalEsquema = () => (Number(form.enganche) || 0) + (Number(form.financiamiento) || 0) + (Number(form.entrega) || 0);
  const esquemaValido = () => totalEsquema() === 100;

  // ── Confirmar apartado ───────────────────────────────────────────────────────
  const confirmarApartado = async () => {
    if (!esquemaValido()) { setError('La suma de Enganche + Financiamiento + Entrega debe ser exactamente 100%.'); return; }
    setSubmitting(true);
    setError(null);

    const payload = {
      invitadoId: urlParams.invitadoId, oppId: urlParams.oppId,
      token: urlParams.token, eventId: urlParams.eventId,
      unidadId: unidadSel.id, unidadNombre: unidadSel.nombre,
      precioVenta: Number(form.precioVenta), montoApartado: Number(form.montoApartado),
      esquemaPago: {
        enganche: Number(form.enganche),
        financiamiento: Number(form.financiamiento),
        entrega: Number(form.entrega),
      },
      mensualidades: form.mensualidades ? Number(form.mensualidades) : null,
      fechaMensualidad: form.fechaMensualidad || null,
      timestamp: new Date().toISOString(),
    };

    try {
      // 1. Anti-colisión
      const verRes = await fetch(ENDPOINTS.verificar, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ unidadId: unidadSel.id, token: urlParams.token }),
      });
      const verData = await verRes.json();
      if (!verRes.ok || verData.disponible === false) {
        setError('⚠️ Unidad no disponible. Selecciona otra unidad.');
        setSubmitting(false);
        setScreen('catalogo');
        await cargarCatalogo();
        return;
      }

      // 2. Confirmar en SF
      const confRes = await fetch(ENDPOINTS.confirmar, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const confData = await confRes.json();
      if (!confRes.ok) throw new Error(confData.error || `Error ${confRes.status}`);

      setOperacion(confData);
      setContador(confData.contador || contador);
      setScreen('confirmado');
    } catch (err) {
      setError('Error al procesar el apartado: ' + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const toggleTheme = () => setTheme((p) => (p === 'dark' ? 'light' : 'dark'));

  // ─── RENDER ───────────────────────────────────────────────────────────────────
  return (
    <div className={`apt-app ${theme === 'dark' ? 'theme-dark' : 'theme-light'}`}>

      {/* ── HEADER ── */}
      <header className="apt-header">
        <div className="apt-header-inner">
          <div className="apt-header-left">
            {screen === 'formulario' && (
              <button className="apt-back-btn" onClick={() => { setScreen('catalogo'); setError(null); }}>
                <ArrowLeft size={16} /> Catálogo
              </button>
            )}
            <div>
              <div className="apt-header-title">Eventos VEQ - Pre-apartado de Unidad</div>
              <div className="apt-header-subtitle">Confirma tu apartado y esquema de pago</div>
            </div>
          </div>
          <div className="apt-header-actions">
            <div className={`apt-status-badge ${isOnline ? 'online' : 'offline'}`}>
              {isOnline ? <Wifi size={14} /> : <WifiOff size={14} />}
              {isOnline ? 'En línea' : 'Sin conexión'}
            </div>
            <button className="apt-icon-btn" onClick={toggleTheme} type="button">
              {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
              {theme === 'dark' ? 'Claro' : 'Oscuro'}
            </button>
          </div>
        </div>
        {contexto && (
          <div className="apt-context-bar">
            <div className="apt-ctx-chip"><Users size={14} /> Asesor: <strong>{contexto.asesor || '—'}</strong></div>
            <div className="apt-ctx-chip"><Users size={14} /> Invitado: <strong>{contexto.invitado || '—'}</strong></div>
            <div className="apt-ctx-chip confirmed"><CheckCircle size={14} /> Estado: <strong>Confirmado (Asistió)</strong></div>
          </div>
        )}
      </header>

      <main className="apt-main">

        {/* Contador del evento */}
        {contador && (
          <section className="apt-counter-bar">
            <div className="apt-counter-item"><Hash size={14} /> Apartados: <strong>{contador.apartados}</strong></div>
            <div className="apt-counter-item"><TrendingUp size={14} /> Umbral: <strong>{contador.umbral}</strong></div>
            <div className="apt-counter-item price"><DollarSign size={14} /> Precio Vigente: <strong>{fmt(contador.precioActual)}</strong></div>
            {contador.apartados >= contador.umbral && (
              <div className="apt-counter-alert"><TrendingUp size={14} /> ¡Umbral alcanzado! Precios actualizados</div>
            )}
          </section>
        )}

        {/* Loading */}
        {loading && (
          <div className="apt-center">
            <Loader2 className="apt-spinner" size={32} />
            <p>Cargando inventario desde Salesforce...</p>
          </div>
        )}

        {/* Error con botón de reintento */}
        {error && !loading && (
          <div className="apt-error-block">
            <AlertTriangle size={22} />
            <div className="apt-error-text">
              {error.split('\n').map((line, i) => <p key={i}>{line}</p>)}
            </div>
            <button className="apt-retry-btn" onClick={cargarCatalogo}>
              <RefreshCw size={15} /> Reintentar
            </button>
          </div>
        )}

        {/* ══ PANTALLA 1: CATÁLOGO ══ */}
        {!loading && !error && screen === 'catalogo' && (
          <section className="apt-catalogo">

            <div className="apt-catalogo-header">
              <div className="apt-section-title">
                <Building2 size={20} /> Inventario Disponible
                <span className="apt-catalogo-count">
                  {inventarioFiltrado.length} unidad{inventarioFiltrado.length !== 1 ? 'es' : ''}
                </span>
              </div>

              {/* Tres filtros independientes — acumulables con AND */}
              <div className="apt-filtros-wrapper">

                {/* Filtro: Nombre del producto con sugerencias en vivo */}
                <div className="apt-filtro-control" ref={sugerenciasRef}>
                  <div className={`apt-dropdown-trigger ${sugerenciasOpen ? 'open' : ''} ${nombreQuery ? 'has-value' : ''}`}>
                    <Search size={15} className="apt-dropdown-icon-left" />
                    <input
                      className="apt-dropdown-input"
                      placeholder="Nombre del producto..."
                      value={nombreQuery}
                      onChange={(e) => { setNombreQuery(e.target.value); setSugerenciasOpen(true); }}
                      onFocus={() => setSugerenciasOpen(true)}
                    />
                    {nombreQuery && (
                      <button
                        className="apt-dropdown-clear"
                        onClick={(e) => { e.stopPropagation(); setNombreQuery(''); setSugerenciasOpen(false); }}
                        type="button"
                      ><X size={14} /></button>
                    )}
                  </div>
                  {sugerenciasOpen && sugerenciasNombre.length > 0 && (
                    <div className="apt-dropdown-panel">
                      {sugerenciasNombre.map((nombre) => (
                        <div
                          key={nombre}
                          className="apt-dropdown-option"
                          onClick={() => { setNombreQuery(nombre); setSugerenciasOpen(false); }}
                        >
                          <Search size={13} />
                          <span>{nombre}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Filtro: Categoría (multi-select, familia de SF) */}
                <div className="apt-filtro-control" ref={categoriaDropdownRef}>
                  <div
                    className={`apt-dropdown-trigger ${categoriaDropdownOpen ? 'open' : ''} ${categoriasSel.length > 0 ? 'has-value' : ''} ${categorias.length === 0 ? 'disabled' : ''}`}
                    onClick={() => categorias.length > 0 && setCategoriaDropdownOpen((v) => !v)}
                  >
                    <Home size={15} className="apt-dropdown-icon-left" />
                    <div className="apt-dropdown-multilabel">
                      {categoriasSel.length === 0
                        ? <span className="apt-dropdown-placeholder">{categorias.length === 0 ? 'No hay categorías' : 'Categoría...'}</span>
                        : <span>{categoriasSel.length === 1 ? categoriasSel[0] : `${categoriasSel.length} categorías`}</span>
                      }
                    </div>
                    <ChevronDown size={15} className={`apt-dropdown-chevron ${categoriaDropdownOpen ? 'rotated' : ''}`} />
                  </div>
                  {categoriaDropdownOpen && categorias.length > 0 && (
                    <div className="apt-dropdown-panel">
                      {categorias.map((cat) => {
                        const checked = categoriasSel.includes(cat);
                        return (
                          <div
                            key={cat}
                            className={`apt-dropdown-option ${checked ? 'selected' : ''}`}
                            onClick={() => toggleCategoria(cat)}
                          >
                            <span className={`apt-checkbox ${checked ? 'checked' : ''}`}>
                              {checked && <CheckCircle size={11} />}
                            </span>
                            <span>{cat}</span>
                            <span className="apt-dropdown-count">
                              {inventario.filter((u) => u.tipo === cat && u.status === 'Disponible').length}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Filtro: Proyecto (multi-select) */}
                <div className="apt-filtro-control" ref={proyectoDropdownRef}>
                  <div
                    className={`apt-dropdown-trigger ${proyectoDropdownOpen ? 'open' : ''} ${proyectosSel.length > 0 ? 'has-value' : ''} ${proyectos.length === 0 ? 'disabled' : ''}`}
                    onClick={() => proyectos.length > 0 && setProyectoDropdownOpen((v) => !v)}
                  >
                    <Building2 size={15} className="apt-dropdown-icon-left" />
                    <div className="apt-dropdown-multilabel">
                      {proyectosSel.length === 0
                        ? <span className="apt-dropdown-placeholder">{proyectos.length === 0 ? 'No hay proyectos' : 'Proyecto...'}</span>
                        : <span>{proyectosSel.length === 1 ? proyectosSel[0].nombre : `${proyectosSel.length} proyectos`}</span>
                      }
                    </div>
                    <ChevronDown size={15} className={`apt-dropdown-chevron ${proyectoDropdownOpen ? 'rotated' : ''}`} />
                  </div>
                  {proyectoDropdownOpen && proyectos.length > 0 && (
                    <div className="apt-dropdown-panel">
                      {proyectos.map((p) => {
                        const checked = proyectosSel.some((x) => x.id === p.id);
                        return (
                          <div
                            key={p.id}
                            className={`apt-dropdown-option ${checked ? 'selected' : ''}`}
                            onClick={() => toggleProyecto(p)}
                          >
                            <span className={`apt-checkbox ${checked ? 'checked' : ''}`}>
                              {checked && <CheckCircle size={11} />}
                            </span>
                            <span>{p.nombre}</span>
                            <span className="apt-dropdown-count">
                              {inventario.filter((u) => u.proyectoId === p.id && u.status === 'Disponible').length}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Chips de filtros activos */}
            {totalFiltrosActivos > 0 && (
              <div className="apt-chips-row">
                {nombreQ && (
                  <div className="apt-filtro-activo">
                    <Search size={13} /> "{nombreQuery}"
                    <button onClick={() => setNombreQuery('')} type="button"><X size={12} /></button>
                  </div>
                )}
                {categoriasSel.map((cat) => (
                  <div key={`cat-${cat}`} className="apt-filtro-activo">
                    <Home size={13} /> {cat}
                    <button onClick={() => toggleCategoria(cat)} type="button"><X size={12} /></button>
                  </div>
                ))}
                {proyectosSel.map((p) => (
                  <div key={`proy-${p.id}`} className="apt-filtro-activo">
                    <Building2 size={13} /> {p.nombre}
                    <button onClick={() => toggleProyecto(p)} type="button"><X size={12} /></button>
                  </div>
                ))}
                {totalFiltrosActivos > 1 && (
                  <button className="apt-link-btn apt-chips-clear" onClick={limpiarTodo} type="button">
                    Limpiar todo
                  </button>
                )}
              </div>
            )}

            {inventarioFiltrado.length === 0 && (
              <div className="apt-empty">
                <Home size={32} />
                <p>
                  {totalFiltrosActivos > 0
                    ? 'No hay unidades que coincidan con los filtros aplicados.'
                    : 'No hay unidades disponibles.'}
                </p>
                {totalFiltrosActivos > 0 && <button className="apt-link-btn" onClick={limpiarTodo}>Limpiar filtros</button>}
              </div>
            )}

            <div className="apt-grid">
              {inventarioFiltrado.map((u) => (
                <div
                  key={u.id}
                  className={`apt-unit-card ${u.status === 'Disponible' ? '' : 'unavailable'}`}
                  onClick={() => u.status === 'Disponible' && seleccionarUnidad(u)}
                >
                  <div className="apt-unit-header">
                    <div className="apt-unit-nombre">{u.nombre}</div>
                    <div className={`apt-unit-badge ${u.status === 'Disponible' ? 'disponible' : 'no-disp'}`}>{u.status}</div>
                  </div>
                  <div className="apt-unit-details">
                    {u.proyectoNombre && <span className="apt-unit-proyecto"><Building2 size={11} /> {u.proyectoNombre}</span>}
                    {u.torre && <span><Building2 size={12} /> {u.torre}</span>}
                    {u.tipo && <span><Home size={12} /> {u.tipo}</span>}
                    {u.m2 && <span>📐 {u.m2} m²</span>}
                    {u.recamaras && <span>🛏 {u.recamaras} rec</span>}
                  </div>
                  <div className="apt-unit-precio">{fmt(u.precio)}</div>
                  {u.status === 'Disponible' && <button className="apt-select-btn">Seleccionar unidad →</button>}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ══ PANTALLA 2: FORMULARIO ══ */}
        {!loading && screen === 'formulario' && unidadSel && (
          <section className="apt-form-section">
            <div className="apt-form-card">
              <div className="apt-form-card-header">
                <Building2 size={22} />
                <div className="apt-form-titulo">
                  Formulario de Pre-apartado: {unidadSel.torre} - Unidad {unidadSel.nombre}
                </div>
              </div>

              <div className="apt-form-row">
                <div className="apt-form-field">
                  <label>Precio de Venta <span className="apt-editable">(Editable)</span></label>
                  <div className="apt-input-prefix">
                    <span>$</span>
                    <input type="number" value={form.precioVenta} placeholder="3,500,000"
                      onChange={(e) => setForm((p) => ({ ...p, precioVenta: e.target.value }))} />
                  </div>
                </div>
                <div className="apt-form-field">
                  <label>Monto de Apartado</label>
                  <div className="apt-input-prefix">
                    <span>$</span>
                    <input type="number" value={form.montoApartado} placeholder="100,000"
                      onChange={(e) => setForm((p) => ({ ...p, montoApartado: e.target.value }))} />
                  </div>
                </div>
              </div>

              <div className="apt-form-field apt-full">
                <label>
                  Esquema de Pago
                  <span className={`apt-total-badge ${esquemaValido() ? 'ok' : 'bad'}`}>Total: {totalEsquema()}%</span>
                </label>
                <div className="apt-esquema-row">
                  {[['enganche', 'Enganche'], ['financiamiento', 'Financiamiento'], ['entrega', 'Entrega']].map(([key, label]) => (
                    <div key={key} className="apt-esquema-item">
                      <input type="number" min="0" max="100" value={form[key]} placeholder="0"
                        onChange={(e) => setForm((p) => ({ ...p, [key]: e.target.value }))} />
                      <span>% {label}</span>
                    </div>
                  ))}
                </div>
                <div className="apt-progress-track">
                  <div className="apt-progress-fill" style={{ width: `${Math.min(totalEsquema(), 100)}%` }} />
                </div>
              </div>

              <div className="apt-form-row">
                <div className="apt-form-field">
                  <label>Número de Mensualidades (If applicable)</label>
                  <input type="number" value={form.mensualidades} placeholder="12"
                    onChange={(e) => setForm((p) => ({ ...p, mensualidades: e.target.value }))} />
                </div>
                <div className="apt-form-field">
                  <label>Fecha de Inicio de Mensualidad</label>
                  <input type="date" value={form.fechaMensualidad}
                    onChange={(e) => setForm((p) => ({ ...p, fechaMensualidad: e.target.value }))} />
                </div>
              </div>

              <div className="apt-resumen-bar">
                <span className="apt-resumen-label">Resumen de Selección</span>
                <span className="apt-resumen-value">
                  {unidadSel.torre ? `${unidadSel.torre} - ` : ''}{unidadSel.nombre}
                  {form.precioVenta ? ` · ${fmt(form.precioVenta)}` : ''}
                </span>
              </div>

              {error && <div className="apt-alert error"><AlertTriangle size={14} /> {error}</div>}

              <button className="apt-confirm-btn" onClick={confirmarApartado} disabled={submitting || !esquemaValido()}>
                {submitting
                  ? <><Loader2 size={16} className="apt-spinner-sm" /> Procesando...</>
                  : <><FileCheck size={16} /> Confirmar Apartado</>}
              </button>
              {!esquemaValido() && <p className="apt-hint">La suma del esquema de pago debe ser exactamente 100%.</p>}
            </div>
          </section>
        )}

        {/* ══ PANTALLA 3: CONFIRMADO ══ */}
        {screen === 'confirmado' && operacion && (
          <section className="apt-confirmado">
            <div className="apt-confirm-card">
              <div className="apt-confirm-header">
                <div className="apt-confirm-icon"><CheckCircle size={28} /></div>
                <div>
                  <div className="apt-confirm-title">Pre-apartado Confirmado</div>
                  <div className="apt-confirm-id">ID de Operación: {operacion.operacionId || 'EV-VEQ-' + Date.now()}</div>
                </div>
              </div>

              <div className="apt-confirm-grid">
                <div><span>Unidad:</span>         <strong>{unidadSel?.torre} - {unidadSel?.nombre}</strong></div>
                <div><span>Invitado:</span>        <strong>{contexto?.invitado}</strong></div>
                <div><span>Asesor:</span>          <strong>{contexto?.asesor}</strong></div>
                <div><span>Precio de Venta:</span> <strong>{fmt(form.precioVenta)}</strong></div>
                <div><span>Monto Apartado:</span>  <strong>{fmt(form.montoApartado)}</strong></div>
                <div><span>Esquema:</span>         <strong>{form.enganche}% E + {form.financiamiento}% F + {form.entrega}% D</strong></div>
              </div>

              <div className="apt-contact-confirm">
                <div className="apt-contact-confirm-title">Confirmación de Contacto del Cliente</div>
                <p>Por favor <strong>confirme verbalmente con el cliente</strong> que los datos de contacto son correctos.</p>
                {operacion.email && <div className="apt-contact-row"><CheckCircle size={14} /> Correo: <span>{operacion.email}</span></div>}
                {operacion.whatsapp && <div className="apt-contact-row"><CheckCircle size={14} /> WhatsApp: <span>{operacion.whatsapp}</span></div>}
              </div>

              <button className="apt-home-btn" onClick={() => { setScreen('catalogo'); setUnidadSel(null); setOperacion(null); setError(null); cargarCatalogo(); }}>
                Volver al Inicio
              </button>
            </div>
          </section>
        )}

      </main>
    </div>
  );
};

export default ApartadoApp;