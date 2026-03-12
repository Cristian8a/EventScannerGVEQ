import React, { useState, useEffect, useCallback } from 'react';
import {
  Building2,
  CheckCircle,
  XCircle,
  Wifi,
  WifiOff,
  Sun,
  Moon,
  ArrowLeft,
  AlertTriangle,
  Loader2,
  DollarSign,
  Home,
  Hash,
  Users,
  TrendingUp,
  FileCheck,
} from 'lucide-react';
import './ApartadoApp.css';

// ─── CONFIG ──────────────────────────────────────────────────────────────────
// Cambia estas URLs por las de tu instancia n8n
const API_BASE = 'https://grupo-veq-n8n-grupo-veq.adsfsj.easypanel.host/webhook';
const ENDPOINTS = {
  catalogo: `${API_BASE}/apartado/catalogo`,        // GET inventario disponible
  verificar: `${API_BASE}/apartado/verificar`,       // POST verificar disponibilidad
  confirmar: `${API_BASE}/apartado/confirmar`,       // POST registrar apartado
  contador: `${API_BASE}/apartado/contador`,        // GET contador del evento
};

// ─── HELPERS ─────────────────────────────────────────────────────────────────
const fmt = (n) =>
  new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(n);

const parseUrlParams = () => {
  const params = new URLSearchParams(window.location.search);
  return {
    invitadoId: params.get('invitadoId') || params.get('invitado') || null,
    oppId: params.get('oppId') || params.get('opp') || null,
    token: params.get('token') || null,
    eventId: params.get('eventId') || params.get('evento') || null,
  };
};

// ─── MAIN COMPONENT ──────────────────────────────────────────────────────────
const ApartadoApp = () => {
  // Contexto de URL
  const [urlParams] = useState(parseUrlParams);

  // Pantalla activa: 'catalogo' | 'formulario' | 'confirmado' | 'error'
  const [screen, setScreen] = useState('catalogo');

  // Datos
  const [inventario, setInventario] = useState([]);
  const [unidadSel, setUnidadSel] = useState(null);
  const [contexto, setContexto] = useState(null); // { asesor, invitado, evento }
  const [operacion, setOperacion] = useState(null); // resultado del apartado
  const [contador, setContador] = useState(null); // { apartados, umbral, precio_actual }

  // Formulario
  const [form, setForm] = useState({
    precioVenta: '',
    montoApartado: '',
    enganche: '',
    financiamiento: '',
    entrega: '',
    mensualidades: '',
    fechaMensualidad: '',
  });

  // UI state
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [theme, setTheme] = useState(() => localStorage.getItem('theme') || 'light');

  useEffect(() => {
    localStorage.setItem('theme', theme);
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  useEffect(() => {
    const up = () => setIsOnline(true);
    const down = () => setIsOnline(false);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    return () => { window.removeEventListener('online', up); window.removeEventListener('offline', down); };
  }, []);

  // ── Cargar catálogo e info de contexto ──
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
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();

      // Esperamos: { unidades: [...], contexto: { asesor, invitado, evento }, contador: {...} }
      setInventario(data.unidades || []);
      setContexto(data.contexto || null);
      setContador(data.contador || null);

      // Pre-cargar precio de la primera unidad si quieres
    } catch (err) {
      setError('No se pudo cargar el inventario. ' + err.message);
    } finally {
      setLoading(false);
    }
  }, [urlParams]);

  useEffect(() => { cargarCatalogo(); }, [cargarCatalogo]);

  // ── Seleccionar unidad → ir a formulario ──
  const seleccionarUnidad = (unidad) => {
    setUnidadSel(unidad);
    setForm((prev) => ({
      ...prev,
      precioVenta: String(unidad.precio || ''),
      montoApartado: String(unidad.montoApartado || ''),
      enganche: '',
      financiamiento: '',
      entrega: '',
      mensualidades: '',
      fechaMensualidad: '',
    }));
    setScreen('formulario');
    setError(null);
  };

  // ── Validar suma esquema de pago ──
  const totalEsquema = () => {
    const e = Number(form.enganche) || 0;
    const f = Number(form.financiamiento) || 0;
    const d = Number(form.entrega) || 0;
    return e + f + d;
  };

  const esquemaValido = () => totalEsquema() === 100;

  // ── Confirmar apartado ──
  const confirmarApartado = async () => {
    if (!esquemaValido()) {
      setError('La suma de Enganche + Financiamiento + Entrega debe ser exactamente 100%.');
      return;
    }
    setSubmitting(true);
    setError(null);

    const payload = {
      invitadoId: urlParams.invitadoId,
      oppId: urlParams.oppId,
      token: urlParams.token,
      eventId: urlParams.eventId,
      unidadId: unidadSel.id,
      unidadNombre: unidadSel.nombre,
      precioVenta: Number(form.precioVenta),
      montoApartado: Number(form.montoApartado),
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
      // 1. Verificar disponibilidad anti-colisión
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

      // 2. Registrar apartado
      const confRes = await fetch(ENDPOINTS.confirmar, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const confData = await confRes.json();
      if (!confRes.ok) throw new Error(confData.error || 'Error al confirmar');

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

  // ─────────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────────
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

        {/* Tarjetas de contexto */}
        {contexto && (
          <div className="apt-context-bar">
            <div className="apt-ctx-chip">
              <Users size={14} /> Asesor: <strong>{contexto.asesor || '—'}</strong>
            </div>
            <div className="apt-ctx-chip">
              <Users size={14} /> Invitado: <strong>{contexto.invitado || '—'}</strong>
            </div>
            <div className="apt-ctx-chip confirmed">
              <CheckCircle size={14} /> Estado: <strong>Confirmado (Asistió)</strong>
            </div>
          </div>
        )}
      </header>

      <main className="apt-main">

        {/* ── CONTADOR DEL EVENTO ── */}
        {contador && (
          <section className="apt-counter-bar">
            <div className="apt-counter-item">
              <Hash size={14} /> Apartados: <strong>{contador.apartados}</strong>
            </div>
            <div className="apt-counter-item">
              <TrendingUp size={14} /> Umbral: <strong>{contador.umbral}</strong>
            </div>
            <div className="apt-counter-item price">
              <DollarSign size={14} /> Precio Vigente: <strong>{fmt(contador.precioActual)}</strong>
            </div>
            {contador.apartados >= contador.umbral && (
              <div className="apt-counter-alert">
                <TrendingUp size={14} /> ¡Umbral alcanzado! Precios actualizados
              </div>
            )}
          </section>
        )}

        {/* ── LOADING ── */}
        {loading && (
          <div className="apt-center">
            <Loader2 className="apt-spinner" size={32} />
            <p>Cargando inventario...</p>
          </div>
        )}

        {/* ── ERROR GLOBAL ── */}
        {error && !loading && (
          <div className="apt-alert error">
            <AlertTriangle size={16} /> {error}
          </div>
        )}

        {/* ══════════════════════════════════════════
            PANTALLA 1: CATÁLOGO DE UNIDADES
        ══════════════════════════════════════════ */}
        {!loading && screen === 'catalogo' && (
          <section className="apt-catalogo">
            <div className="apt-section-title">
              <Building2 size={20} /> Inventario Disponible
            </div>

            {inventario.length === 0 && !error && (
              <div className="apt-empty">
                <Home size={32} />
                <p>No hay unidades disponibles en este momento.</p>
              </div>
            )}

            <div className="apt-grid">
              {inventario.map((u) => (
                <div
                  key={u.id}
                  className={`apt-unit-card ${u.status === 'Disponible' ? '' : 'unavailable'}`}
                  onClick={() => u.status === 'Disponible' && seleccionarUnidad(u)}
                >
                  <div className="apt-unit-header">
                    <div className="apt-unit-nombre">{u.nombre}</div>
                    <div className={`apt-unit-badge ${u.status === 'Disponible' ? 'disponible' : 'no-disp'}`}>
                      {u.status}
                    </div>
                  </div>

                  <div className="apt-unit-details">
                    {u.torre && <span><Building2 size={12} /> {u.torre}</span>}
                    {u.tipo && <span><Home size={12} /> {u.tipo}</span>}
                    {u.m2 && <span>📐 {u.m2} m²</span>}
                    {u.recamaras && <span>🛏 {u.recamaras} rec</span>}
                  </div>

                  <div className="apt-unit-precio">{fmt(u.precio)}</div>

                  {u.status === 'Disponible' && (
                    <button className="apt-select-btn">
                      Seleccionar unidad →
                    </button>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ══════════════════════════════════════════
            PANTALLA 2: FORMULARIO DE PRE-APARTADO
        ══════════════════════════════════════════ */}
        {!loading && screen === 'formulario' && unidadSel && (
          <section className="apt-form-section">
            <div className="apt-form-card">
              <div className="apt-form-card-header">
                <Building2 size={22} />
                <div>
                  <div className="apt-form-titulo">
                    Formulario de Pre-apartado: {unidadSel.torre} - Unidad {unidadSel.nombre}
                  </div>
                </div>
              </div>

              {/* Fila 1: Precio + Monto */}
              <div className="apt-form-row">
                <div className="apt-form-field">
                  <label>Precio de Venta <span className="apt-editable">(Editable)</span></label>
                  <div className="apt-input-prefix">
                    <span>$</span>
                    <input
                      type="number"
                      value={form.precioVenta}
                      onChange={(e) => setForm((p) => ({ ...p, precioVenta: e.target.value }))}
                      placeholder="3,500,000"
                    />
                  </div>
                </div>
                <div className="apt-form-field">
                  <label>Monto de Apartado</label>
                  <div className="apt-input-prefix">
                    <span>$</span>
                    <input
                      type="number"
                      value={form.montoApartado}
                      onChange={(e) => setForm((p) => ({ ...p, montoApartado: e.target.value }))}
                      placeholder="100,000"
                    />
                  </div>
                </div>
              </div>

              {/* Esquema de pago */}
              <div className="apt-form-field apt-full">
                <label>
                  Esquema de Pago
                  <span className={`apt-total-badge ${esquemaValido() ? 'ok' : 'bad'}`}>
                    Total: {totalEsquema()}%
                  </span>
                </label>
                <div className="apt-esquema-row">
                  <div className="apt-esquema-item">
                    <input
                      type="number"
                      min="0" max="100"
                      value={form.enganche}
                      onChange={(e) => setForm((p) => ({ ...p, enganche: e.target.value }))}
                      placeholder="0"
                    />
                    <span>% Enganche</span>
                  </div>
                  <div className="apt-esquema-item">
                    <input
                      type="number"
                      min="0" max="100"
                      value={form.financiamiento}
                      onChange={(e) => setForm((p) => ({ ...p, financiamiento: e.target.value }))}
                      placeholder="0"
                    />
                    <span>% Financiamiento</span>
                  </div>
                  <div className="apt-esquema-item">
                    <input
                      type="number"
                      min="0" max="100"
                      value={form.entrega}
                      onChange={(e) => setForm((p) => ({ ...p, entrega: e.target.value }))}
                      placeholder="0"
                    />
                    <span>% Entrega</span>
                  </div>
                </div>
                {/* Barra visual */}
                <div className="apt-progress-track">
                  <div
                    className="apt-progress-fill"
                    style={{ width: `${Math.min(totalEsquema(), 100)}%` }}
                  />
                </div>
              </div>

              {/* Mensualidades */}
              <div className="apt-form-row">
                <div className="apt-form-field">
                  <label>Número de Mensualidades (If applicable)</label>
                  <input
                    type="number"
                    value={form.mensualidades}
                    onChange={(e) => setForm((p) => ({ ...p, mensualidades: e.target.value }))}
                    placeholder="12"
                  />
                </div>
                <div className="apt-form-field">
                  <label>Fecha de Inicio de Mensualidad</label>
                  <input
                    type="date"
                    value={form.fechaMensualidad}
                    onChange={(e) => setForm((p) => ({ ...p, fechaMensualidad: e.target.value }))}
                  />
                </div>
              </div>

              {/* Resumen */}
              <div className="apt-resumen-bar">
                <span className="apt-resumen-label">Resumen de Selección</span>
                <span className="apt-resumen-value">
                  {unidadSel.torre ? `${unidadSel.torre} - ` : ''}{unidadSel.nombre}
                  {form.precioVenta ? ` · ${fmt(form.precioVenta)}` : ''}
                </span>
              </div>

              {error && (
                <div className="apt-alert error">
                  <AlertTriangle size={14} /> {error}
                </div>
              )}

              <button
                className="apt-confirm-btn"
                onClick={confirmarApartado}
                disabled={submitting || !esquemaValido()}
              >
                {submitting ? (
                  <><Loader2 size={16} className="apt-spinner-sm" /> Procesando...</>
                ) : (
                  <><FileCheck size={16} /> Confirmar Apartado</>
                )}
              </button>

              {!esquemaValido() && (
                <p className="apt-hint">La suma del esquema de pago debe ser exactamente 100%.</p>
              )}
            </div>
          </section>
        )}

        {/* ══════════════════════════════════════════
            PANTALLA 3: RESUMEN DE CONFIRMACIÓN
        ══════════════════════════════════════════ */}
        {screen === 'confirmado' && operacion && (
          <section className="apt-confirmado">
            <div className="apt-confirm-card">
              <div className="apt-confirm-header">
                <div className="apt-confirm-icon"><CheckCircle size={28} /></div>
                <div>
                  <div className="apt-confirm-title">Pre-apartado Confirmado</div>
                  <div className="apt-confirm-id">ID de Operación: {operacion.operacionId || operacion.id || 'EV-VEQ-' + Date.now()}</div>
                </div>
              </div>

              <div className="apt-confirm-grid">
                <div><span>Unidad:</span> <strong>{unidadSel?.torre} - {unidadSel?.nombre}</strong></div>
                <div><span>Invitado:</span> <strong>{contexto?.invitado}</strong></div>
                <div><span>Asesor:</span> <strong>{contexto?.asesor}</strong></div>
                <div><span>Precio de Venta:</span> <strong>{fmt(form.precioVenta)}</strong></div>
                <div><span>Monto de Apartado:</span> <strong>{fmt(form.montoApartado)}</strong></div>
                <div>
                  <span>Esquema:</span>
                  <strong>{form.enganche}% E + {form.financiamiento}% F + {form.entrega}% D</strong>
                </div>
              </div>

              {/* Confirmación de contacto */}
              <div className="apt-contact-confirm">
                <div className="apt-contact-confirm-title">Confirmación de Contacto del Cliente</div>
                <p>
                  Para proceder, por favor <strong>confirme verbalmente con el cliente</strong> que
                  los siguientes datos de contacto registrados son correctos. De lo contrario,
                  actualice los registros en la pestaña de "Detalles de Contacto" antes de finalizar.
                </p>
                {operacion.email && (
                  <div className="apt-contact-row">
                    <CheckCircle size={14} /> Correo: <span>{operacion.email}</span>
                  </div>
                )}
                {operacion.whatsapp && (
                  <div className="apt-contact-row">
                    <CheckCircle size={14} /> WhatsApp: <span>{operacion.whatsapp}</span>
                  </div>
                )}
              </div>

              <button
                className="apt-home-btn"
                onClick={() => {
                  setScreen('catalogo');
                  setUnidadSel(null);
                  setOperacion(null);
                  setError(null);
                  cargarCatalogo();
                }}
              >
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


// Datos sinteticos para pruebas

// import React, { useState, useEffect, useCallback } from 'react';
// import {
//   Building2,
//   CheckCircle,
//   XCircle,
//   Wifi,
//   WifiOff,
//   Sun,
//   Moon,
//   ArrowLeft,
//   AlertTriangle,
//   Loader2,
//   DollarSign,
//   Home,
//   Hash,
//   Users,
//   TrendingUp,
//   FileCheck,
// } from 'lucide-react';
// import './ApartadoApp.css';

// // ─── CONFIG ──────────────────────────────────────────────────────────────────
// // Cambia estas URLs por las de tu instancia n8n
// const API_BASE = 'https://grupo-veq-n8n-grupo-veq.adsfsj.easypanel.host/webhook';
// const ENDPOINTS = {
//   catalogo:    `${API_BASE}/apartado/catalogo`,        // GET inventario disponible
//   verificar:   `${API_BASE}/apartado/verificar`,       // POST verificar disponibilidad
//   confirmar:   `${API_BASE}/apartado/confirmar`,       // POST registrar apartado
//   contador:    `${API_BASE}/apartado/contador`,        // GET contador del evento
// };

// // ─── MODO DEMO (activo cuando el backend no responde) ────────────────────────
// const MOCK_DATA = {
//   contexto: {
//     asesor:   'Ana García',
//     invitado: 'Juan Pérez',
//     evento:   'Open House Primavera 2025',
//     eventoId: 'EVT-DEMO-001',
//   },
//   contador: {
//     apartados:    3,
//     umbral:       10,
//     precioActual: 3500000,
//   },
//   unidades: [
//     { id: 'U-101', nombre: 'A-101', torre: 'Torre A', tipo: 'Departamento', m2: 85,  recamaras: 2, precio: 3500000, montoApartado: 100000, status: 'Disponible' },
//     { id: 'U-102', nombre: 'A-102', torre: 'Torre A', tipo: 'Departamento', m2: 92,  recamaras: 2, precio: 3750000, montoApartado: 100000, status: 'Disponible' },
//     { id: 'U-103', nombre: 'A-103', torre: 'Torre A', tipo: 'Departamento', m2: 110, recamaras: 3, precio: 4200000, montoApartado: 120000, status: 'Disponible' },
//     { id: 'U-201', nombre: 'B-201', torre: 'Torre B', tipo: 'Penthouse',    m2: 180, recamaras: 3, precio: 6800000, montoApartado: 200000, status: 'Disponible' },
//     { id: 'U-202', nombre: 'B-202', torre: 'Torre B', tipo: 'Departamento', m2: 78,  recamaras: 2, precio: 3200000, montoApartado: 100000, status: 'Apartado'   },
//     { id: 'U-203', nombre: 'B-203', torre: 'Torre B', tipo: 'Departamento', m2: 95,  recamaras: 2, precio: 3600000, montoApartado: 100000, status: 'Disponible' },
//   ],
// };

// // ─── HELPERS ─────────────────────────────────────────────────────────────────
// const fmt = (n) =>
//   new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(n);

// const parseUrlParams = () => {
//   const params = new URLSearchParams(window.location.search);
//   return {
//     invitadoId: params.get('invitadoId') || params.get('invitado') || null,
//     oppId:      params.get('oppId')      || params.get('opp')      || null,
//     token:      params.get('token')                                 || null,
//     eventId:    params.get('eventId')    || params.get('evento')   || null,
//   };
// };

// // ─── MAIN COMPONENT ──────────────────────────────────────────────────────────
// const ApartadoApp = () => {
//   // Contexto de URL
//   const [urlParams]   = useState(parseUrlParams);

//   // Pantalla activa: 'catalogo' | 'formulario' | 'confirmado' | 'error'
//   const [screen, setScreen] = useState('catalogo');

//   // Datos
//   const [inventario,   setInventario]   = useState([]);
//   const [unidadSel,    setUnidadSel]    = useState(null);
//   const [contexto,     setContexto]     = useState(null); // { asesor, invitado, evento }
//   const [operacion,    setOperacion]    = useState(null); // resultado del apartado
//   const [contador,     setContador]     = useState(null); // { apartados, umbral, precio_actual }

//   // Formulario
//   const [form, setForm] = useState({
//     precioVenta:    '',
//     montoApartado:  '',
//     enganche:       '',
//     financiamiento: '',
//     entrega:        '',
//     mensualidades:  '',
//     fechaMensualidad: '',
//   });

//   // UI state
//   const [loading,    setLoading]    = useState(true);
//   const [submitting, setSubmitting] = useState(false);
//   const [error,      setError]      = useState(null);
//   const [isDemoMode, setIsDemoMode] = useState(false);
//   const [isOnline,   setIsOnline]   = useState(navigator.onLine);
//   const [theme,      setTheme]     = useState(() => localStorage.getItem('theme') || 'light');

//   useEffect(() => {
//     localStorage.setItem('theme', theme);
//     document.documentElement.setAttribute('data-theme', theme);
//   }, [theme]);

//   useEffect(() => {
//     const up   = () => setIsOnline(true);
//     const down = () => setIsOnline(false);
//     window.addEventListener('online', up);
//     window.addEventListener('offline', down);
//     return () => { window.removeEventListener('online', up); window.removeEventListener('offline', down); };
//   }, []);

//   // ── Cargar catálogo e info de contexto ──
//   const cargarCatalogo = useCallback(async () => {
//     setLoading(true);
//     setError(null);
//     try {
//       const res = await fetch(ENDPOINTS.catalogo, {
//         method: 'POST',
//         headers: { 'Content-Type': 'application/json' },
//         body: JSON.stringify({
//           invitadoId: urlParams.invitadoId,
//           oppId:      urlParams.oppId,
//           token:      urlParams.token,
//           eventId:    urlParams.eventId,
//         }),
//       });
//       if (!res.ok) throw new Error(`HTTP ${res.status}`);
//       const data = await res.json();

//       // Esperamos: { unidades: [...], contexto: { asesor, invitado, evento }, contador: {...} }
//       setInventario(data.unidades  || []);
//       setContexto(data.contexto   || null);
//       setContador(data.contador   || null);

//       // Pre-cargar precio de la primera unidad si quieres
//     } catch (err) {
//       // Backend no disponible → modo demo con datos mock
//       console.warn('[ApartadoApp] Backend no disponible, usando datos demo:', err.message);
//       setInventario(MOCK_DATA.unidades);
//       setContexto(MOCK_DATA.contexto);
//       setContador(MOCK_DATA.contador);
//       setError(null); // no mostrar error, el demo se ve limpio
//       setIsDemoMode(true);
//     } finally {
//       setLoading(false);
//     }
//   }, [urlParams]);

//   useEffect(() => { cargarCatalogo(); }, [cargarCatalogo]);

//   // ── Seleccionar unidad → ir a formulario ──
//   const seleccionarUnidad = (unidad) => {
//     setUnidadSel(unidad);
//     setForm((prev) => ({
//       ...prev,
//       precioVenta:   String(unidad.precio || ''),
//       montoApartado: String(unidad.montoApartado || ''),
//       enganche:      '',
//       financiamiento:'',
//       entrega:       '',
//       mensualidades: '',
//       fechaMensualidad: '',
//     }));
//     setScreen('formulario');
//     setError(null);
//   };

//   // ── Validar suma esquema de pago ──
//   const totalEsquema = () => {
//     const e = Number(form.enganche)       || 0;
//     const f = Number(form.financiamiento) || 0;
//     const d = Number(form.entrega)        || 0;
//     return e + f + d;
//   };

//   const esquemaValido = () => totalEsquema() === 100;

//   // ── Confirmar apartado ──
//   const confirmarApartado = async () => {
//     if (!esquemaValido()) {
//       setError('La suma de Enganche + Financiamiento + Entrega debe ser exactamente 100%.');
//       return;
//     }
//     setSubmitting(true);
//     setError(null);

//     // ── MODO DEMO: simular confirmación sin backend ──
//     if (isDemoMode) {
//       await new Promise((r) => setTimeout(r, 1200)); // simula latencia
//       setOperacion({
//         operacionId: 'EV-VEQ-DEMO-001',
//         email:       'juan.perez@demo.com',
//         whatsapp:    '+52 33 1234 5678',
//         contador:    { apartados: (contador?.apartados || 0) + 1, umbral: contador?.umbral || 10, precioActual: contador?.precioActual || 3500000 },
//         message:     'Pre-apartado registrado exitosamente (modo demo)',
//       });
//       setSubmitting(false);
//       setScreen('confirmado');
//       return;
//     }

//     const payload = {
//       invitadoId:      urlParams.invitadoId,
//       oppId:           urlParams.oppId,
//       token:           urlParams.token,
//       eventId:         urlParams.eventId,
//       unidadId:        unidadSel.id,
//       unidadNombre:    unidadSel.nombre,
//       precioVenta:     Number(form.precioVenta),
//       montoApartado:   Number(form.montoApartado),
//       esquemaPago: {
//         enganche:       Number(form.enganche),
//         financiamiento: Number(form.financiamiento),
//         entrega:        Number(form.entrega),
//       },
//       mensualidades:   form.mensualidades    ? Number(form.mensualidades)    : null,
//       fechaMensualidad: form.fechaMensualidad || null,
//       timestamp:       new Date().toISOString(),
//     };

//     try {
//       // 1. Verificar disponibilidad anti-colisión
//       const verRes = await fetch(ENDPOINTS.verificar, {
//         method: 'POST',
//         headers: { 'Content-Type': 'application/json' },
//         body: JSON.stringify({ unidadId: unidadSel.id, token: urlParams.token }),
//       });
//       const verData = await verRes.json();
//       if (!verRes.ok || verData.disponible === false) {
//         setError('⚠️ Unidad no disponible. Selecciona otra unidad.');
//         setSubmitting(false);
//         setScreen('catalogo');
//         await cargarCatalogo();
//         return;
//       }

//       // 2. Registrar apartado
//       const confRes = await fetch(ENDPOINTS.confirmar, {
//         method: 'POST',
//         headers: { 'Content-Type': 'application/json' },
//         body: JSON.stringify(payload),
//       });
//       const confData = await confRes.json();
//       if (!confRes.ok) throw new Error(confData.error || 'Error al confirmar');

//       setOperacion(confData);
//       setContador(confData.contador || contador);
//       setScreen('confirmado');
//     } catch (err) {
//       setError('Error al procesar el apartado: ' + err.message);
//     } finally {
//       setSubmitting(false);
//     }
//   };

//   const toggleTheme = () => setTheme((p) => (p === 'dark' ? 'light' : 'dark'));

//   // ─────────────────────────────────────────────────────────────────────────────
//   // RENDER
//   // ─────────────────────────────────────────────────────────────────────────────
//   return (
//     <div className={`apt-app ${theme === 'dark' ? 'theme-dark' : 'theme-light'}`}>

//       {/* ── HEADER ── */}
//       <header className="apt-header">
//         <div className="apt-header-inner">
//           <div className="apt-header-left">
//             {screen === 'formulario' && (
//               <button className="apt-back-btn" onClick={() => { setScreen('catalogo'); setError(null); }}>
//                 <ArrowLeft size={16} /> Catálogo
//               </button>
//             )}
//             <div>
//               <div className="apt-header-title">Eventos VEQ - Pre-apartado de Unidad</div>
//               <div className="apt-header-subtitle">Confirma tu apartado y esquema de pago</div>
//             </div>
//           </div>

//           <div className="apt-header-actions">
//             <div className={`apt-status-badge ${isOnline ? 'online' : 'offline'}`}>
//               {isOnline ? <Wifi size={14} /> : <WifiOff size={14} />}
//               {isOnline ? 'En línea' : 'Sin conexión'}
//             </div>
//             <button className="apt-icon-btn" onClick={toggleTheme} type="button">
//               {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
//               {theme === 'dark' ? 'Claro' : 'Oscuro'}
//             </button>
//           </div>
//         </div>

//         {/* Tarjetas de contexto */}
//         {contexto && (
//           <div className="apt-context-bar">
//             <div className="apt-ctx-chip">
//               <Users size={14} /> Asesor: <strong>{contexto.asesor || '—'}</strong>
//             </div>
//             <div className="apt-ctx-chip">
//               <Users size={14} /> Invitado: <strong>{contexto.invitado || '—'}</strong>
//             </div>
//             <div className="apt-ctx-chip confirmed">
//               <CheckCircle size={14} /> Estado: <strong>Confirmado (Asistió)</strong>
//             </div>
//           </div>
//         )}
//       </header>

//       <main className="apt-main">

//         {/* ── BANNER MODO DEMO ── */}
//         {isDemoMode && (
//           <div className="apt-demo-banner">
//             🧪 <strong>Modo demo</strong> — datos simulados. Conecta n8n para usar datos reales de Salesforce.
//           </div>
//         )}

//         {/* ── CONTADOR DEL EVENTO ── */}
//         {contador && (
//           <section className="apt-counter-bar">
//             <div className="apt-counter-item">
//               <Hash size={14} /> Apartados: <strong>{contador.apartados}</strong>
//             </div>
//             <div className="apt-counter-item">
//               <TrendingUp size={14} /> Umbral: <strong>{contador.umbral}</strong>
//             </div>
//             <div className="apt-counter-item price">
//               <DollarSign size={14} /> Precio Vigente: <strong>{fmt(contador.precioActual)}</strong>
//             </div>
//             {contador.apartados >= contador.umbral && (
//               <div className="apt-counter-alert">
//                 <TrendingUp size={14} /> ¡Umbral alcanzado! Precios actualizados
//               </div>
//             )}
//           </section>
//         )}

//         {/* ── LOADING ── */}
//         {loading && (
//           <div className="apt-center">
//             <Loader2 className="apt-spinner" size={32} />
//             <p>Cargando inventario...</p>
//           </div>
//         )}

//         {/* ── ERROR GLOBAL ── */}
//         {error && !loading && (
//           <div className="apt-alert error">
//             <AlertTriangle size={16} /> {error}
//           </div>
//         )}

//         {/* ══════════════════════════════════════════
//             PANTALLA 1: CATÁLOGO DE UNIDADES
//         ══════════════════════════════════════════ */}
//         {!loading && screen === 'catalogo' && (
//           <section className="apt-catalogo">
//             <div className="apt-section-title">
//               <Building2 size={20} /> Inventario Disponible
//             </div>

//             {inventario.length === 0 && !error && (
//               <div className="apt-empty">
//                 <Home size={32} />
//                 <p>No hay unidades disponibles en este momento.</p>
//               </div>
//             )}

//             <div className="apt-grid">
//               {inventario.map((u) => (
//                 <div
//                   key={u.id}
//                   className={`apt-unit-card ${u.status === 'Disponible' ? '' : 'unavailable'}`}
//                   onClick={() => u.status === 'Disponible' && seleccionarUnidad(u)}
//                 >
//                   <div className="apt-unit-header">
//                     <div className="apt-unit-nombre">{u.nombre}</div>
//                     <div className={`apt-unit-badge ${u.status === 'Disponible' ? 'disponible' : 'no-disp'}`}>
//                       {u.status}
//                     </div>
//                   </div>

//                   <div className="apt-unit-details">
//                     {u.torre    && <span><Building2 size={12} /> {u.torre}</span>}
//                     {u.tipo     && <span><Home size={12} /> {u.tipo}</span>}
//                     {u.m2       && <span>📐 {u.m2} m²</span>}
//                     {u.recamaras && <span>🛏 {u.recamaras} rec</span>}
//                   </div>

//                   <div className="apt-unit-precio">{fmt(u.precio)}</div>

//                   {u.status === 'Disponible' && (
//                     <button className="apt-select-btn">
//                       Seleccionar unidad →
//                     </button>
//                   )}
//                 </div>
//               ))}
//             </div>
//           </section>
//         )}

//         {/* ══════════════════════════════════════════
//             PANTALLA 2: FORMULARIO DE PRE-APARTADO
//         ══════════════════════════════════════════ */}
//         {!loading && screen === 'formulario' && unidadSel && (
//           <section className="apt-form-section">
//             <div className="apt-form-card">
//               <div className="apt-form-card-header">
//                 <Building2 size={22} />
//                 <div>
//                   <div className="apt-form-titulo">
//                     Formulario de Pre-apartado: {unidadSel.torre} - Unidad {unidadSel.nombre}
//                   </div>
//                 </div>
//               </div>

//               {/* Fila 1: Precio + Monto */}
//               <div className="apt-form-row">
//                 <div className="apt-form-field">
//                   <label>Precio de Venta <span className="apt-editable">(Editable)</span></label>
//                   <div className="apt-input-prefix">
//                     <span>$</span>
//                     <input
//                       type="number"
//                       value={form.precioVenta}
//                       onChange={(e) => setForm((p) => ({ ...p, precioVenta: e.target.value }))}
//                       placeholder="3,500,000"
//                     />
//                   </div>
//                 </div>
//                 <div className="apt-form-field">
//                   <label>Monto de Apartado</label>
//                   <div className="apt-input-prefix">
//                     <span>$</span>
//                     <input
//                       type="number"
//                       value={form.montoApartado}
//                       onChange={(e) => setForm((p) => ({ ...p, montoApartado: e.target.value }))}
//                       placeholder="100,000"
//                     />
//                   </div>
//                 </div>
//               </div>

//               {/* Esquema de pago */}
//               <div className="apt-form-field apt-full">
//                 <label>
//                   Esquema de Pago
//                   <span className={`apt-total-badge ${esquemaValido() ? 'ok' : 'bad'}`}>
//                     Total: {totalEsquema()}%
//                   </span>
//                 </label>
//                 <div className="apt-esquema-row">
//                   <div className="apt-esquema-item">
//                     <input
//                       type="number"
//                       min="0" max="100"
//                       value={form.enganche}
//                       onChange={(e) => setForm((p) => ({ ...p, enganche: e.target.value }))}
//                       placeholder="0"
//                     />
//                     <span>% Enganche</span>
//                   </div>
//                   <div className="apt-esquema-item">
//                     <input
//                       type="number"
//                       min="0" max="100"
//                       value={form.financiamiento}
//                       onChange={(e) => setForm((p) => ({ ...p, financiamiento: e.target.value }))}
//                       placeholder="0"
//                     />
//                     <span>% Financiamiento</span>
//                   </div>
//                   <div className="apt-esquema-item">
//                     <input
//                       type="number"
//                       min="0" max="100"
//                       value={form.entrega}
//                       onChange={(e) => setForm((p) => ({ ...p, entrega: e.target.value }))}
//                       placeholder="0"
//                     />
//                     <span>% Entrega</span>
//                   </div>
//                 </div>
//                 {/* Barra visual */}
//                 <div className="apt-progress-track">
//                   <div
//                     className="apt-progress-fill"
//                     style={{ width: `${Math.min(totalEsquema(), 100)}%` }}
//                   />
//                 </div>
//               </div>

//               {/* Mensualidades */}
//               <div className="apt-form-row">
//                 <div className="apt-form-field">
//                   <label>Número de Mensualidades (If applicable)</label>
//                   <input
//                     type="number"
//                     value={form.mensualidades}
//                     onChange={(e) => setForm((p) => ({ ...p, mensualidades: e.target.value }))}
//                     placeholder="12"
//                   />
//                 </div>
//                 <div className="apt-form-field">
//                   <label>Fecha de Inicio de Mensualidad</label>
//                   <input
//                     type="date"
//                     value={form.fechaMensualidad}
//                     onChange={(e) => setForm((p) => ({ ...p, fechaMensualidad: e.target.value }))}
//                   />
//                 </div>
//               </div>

//               {/* Resumen */}
//               <div className="apt-resumen-bar">
//                 <span className="apt-resumen-label">Resumen de Selección</span>
//                 <span className="apt-resumen-value">
//                   {unidadSel.torre ? `${unidadSel.torre} - ` : ''}{unidadSel.nombre}
//                   {form.precioVenta ? ` · ${fmt(form.precioVenta)}` : ''}
//                 </span>
//               </div>

//               {error && (
//                 <div className="apt-alert error">
//                   <AlertTriangle size={14} /> {error}
//                 </div>
//               )}

//               <button
//                 className="apt-confirm-btn"
//                 onClick={confirmarApartado}
//                 disabled={submitting || !esquemaValido()}
//               >
//                 {submitting ? (
//                   <><Loader2 size={16} className="apt-spinner-sm" /> Procesando...</>
//                 ) : (
//                   <><FileCheck size={16} /> Confirmar Apartado</>
//                 )}
//               </button>

//               {!esquemaValido() && (
//                 <p className="apt-hint">La suma del esquema de pago debe ser exactamente 100%.</p>
//               )}
//             </div>
//           </section>
//         )}

//         {/* ══════════════════════════════════════════
//             PANTALLA 3: RESUMEN DE CONFIRMACIÓN
//         ══════════════════════════════════════════ */}
//         {screen === 'confirmado' && operacion && (
//           <section className="apt-confirmado">
//             <div className="apt-confirm-card">
//               <div className="apt-confirm-header">
//                 <div className="apt-confirm-icon"><CheckCircle size={28} /></div>
//                 <div>
//                   <div className="apt-confirm-title">Pre-apartado Confirmado</div>
//                   <div className="apt-confirm-id">ID de Operación: {operacion.operacionId || operacion.id || 'EV-VEQ-' + Date.now()}</div>
//                 </div>
//               </div>

//               <div className="apt-confirm-grid">
//                 <div><span>Unidad:</span> <strong>{unidadSel?.torre} - {unidadSel?.nombre}</strong></div>
//                 <div><span>Invitado:</span> <strong>{contexto?.invitado}</strong></div>
//                 <div><span>Asesor:</span> <strong>{contexto?.asesor}</strong></div>
//                 <div><span>Precio de Venta:</span> <strong>{fmt(form.precioVenta)}</strong></div>
//                 <div><span>Monto de Apartado:</span> <strong>{fmt(form.montoApartado)}</strong></div>
//                 <div>
//                   <span>Esquema:</span>
//                   <strong>{form.enganche}% E + {form.financiamiento}% F + {form.entrega}% D</strong>
//                 </div>
//               </div>

//               {/* Confirmación de contacto */}
//               <div className="apt-contact-confirm">
//                 <div className="apt-contact-confirm-title">Confirmación de Contacto del Cliente</div>
//                 <p>
//                   Para proceder, por favor <strong>confirme verbalmente con el cliente</strong> que
//                   los siguientes datos de contacto registrados son correctos. De lo contrario,
//                   actualice los registros en la pestaña de "Detalles de Contacto" antes de finalizar.
//                 </p>
//                 {operacion.email && (
//                   <div className="apt-contact-row">
//                     <CheckCircle size={14} /> Correo: <span>{operacion.email}</span>
//                   </div>
//                 )}
//                 {operacion.whatsapp && (
//                   <div className="apt-contact-row">
//                     <CheckCircle size={14} /> WhatsApp: <span>{operacion.whatsapp}</span>
//                   </div>
//                 )}
//               </div>

//               <button
//                 className="apt-home-btn"
//                 onClick={() => {
//                   setScreen('catalogo');
//                   setUnidadSel(null);
//                   setOperacion(null);
//                   setError(null);
//                   cargarCatalogo();
//                 }}
//               >
//                 Volver al Inicio
//               </button>
//             </div>
//           </section>
//         )}

//       </main>
//     </div>
//   );
// };

// export default ApartadoApp;