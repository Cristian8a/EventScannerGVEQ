import React, { useState, useEffect } from 'react';
import { Scanner } from '@yudiel/react-qr-scanner';
import {
  Camera,
  CheckCircle,
  XCircle,
  Users,
  Clock,
  Wifi,
  WifiOff,
  Sun,
  Moon,
  UserPlus,
} from 'lucide-react';
import './QRScannerApp.css';

const QRScannerApp = () => {
  const [scanning, setScanning] = useState(false);
  const [lastScan, setLastScan] = useState(null);
  const [stats, setStats] = useState({ total: 0, successful: 0, failed: 0 });
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const [pendingScans, setPendingScans] = useState([]);

  // ✅ NUEVO: invitado actual mostrado arriba del scanner
  const [currentGuest, setCurrentGuest] = useState(null);

  const WEBHOOK_URL = 'https://n8n.srv1286386.hstgr.cloud/webhook/scan-qr';

  // ✅ NUEVO: webhook para registrar cliente (lo creas en n8n)
  const REGISTER_WEBHOOK_URL =
    'https://n8n.srv1286386.hstgr.cloud/webhook/registrar-cliente';

  // ✅ NUEVO: modal + form
  const [showRegister, setShowRegister] = useState(false);
  const [registerLoading, setRegisterLoading] = useState(false);
  const [registerError, setRegisterError] = useState(null);
  const [registerSuccess, setRegisterSuccess] = useState(null);
  const [registerForm, setRegisterForm] = useState({
    nombre: '',
    apellido: '',
    telefono: '',
    email: '',
    eventoVentas: '',
  });

  // ✅ TEMA (claro/oscuro) + persistencia
  const [theme, setTheme] = useState(() => {
    const saved = localStorage.getItem('theme');
    if (saved) return saved;

    const prefersDark =
      typeof window !== 'undefined' &&
      window.matchMedia &&
      window.matchMedia('(prefers-color-scheme: dark)').matches;

    return prefersDark ? 'dark' : 'light';
  });

  useEffect(() => {
    localStorage.setItem('theme', theme);
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  const toggleTheme = () =>
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    const saved = localStorage.getItem('pendingScans');
    if (saved) setPendingScans(JSON.parse(saved));

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  useEffect(() => {
    if (isOnline && pendingScans.length > 0) syncPendingScans();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOnline]);

  const normalizePhoneMX = (phoneRaw) => {
    if (!phoneRaw) return '';
    const trimmed = String(phoneRaw).trim();
    const digits = trimmed.replace(/[^\d+]/g, '');
    // respeta +1
    if (digits.startsWith('+1')) return digits;
    // si ya viene con +52
    if (digits.startsWith('+52')) return digits;
    // si viene 52...
    if (digits.startsWith('52')) return `+${digits}`;
    // si viene 10 dígitos mx
    const onlyDigits = trimmed.replace(/\D/g, '');
    if (onlyDigits.length === 10) return `+52${onlyDigits}`;
    // fallback
    return trimmed.startsWith('+') ? trimmed : `+${trimmed}`;
  };

  const processQRCode = async (qrData) => {
    if (!qrData) return;

    try {
      const parts = qrData.split('|').reduce((acc, part) => {
        const [key, value] = part.split(':');
        acc[key] = value;
        return acc;
      }, {});

      const scanData = {
        eventId: parts.EVENT,
        invitadoId: parts.INVITADO,
        leadId: parts.LEAD,
        hash: parts.HASH,
        scannedAt: new Date().toISOString(),
        qrData: qrData,
      };

      if (isOnline) {
        await sendToWebhook(scanData);
      } else {
        const pending = [...pendingScans, scanData];
        setPendingScans(pending);
        localStorage.setItem('pendingScans', JSON.stringify(pending));

        // ⚠️ Offline: no puedes saber nombre/email, porque vienen de SF via n8n.
        setCurrentGuest({
          nombre: 'Sin datos (offline)',
          email: 'Se mostrará al sincronizar',
        });

        setLastScan({
          success: true,
          message: 'Guardado offline - Se sincronizará cuando haya conexión',
          qrData: qrData,
          timestamp: Date.now(),
          data: scanData,
        });

        setStats((prev) => ({
          ...prev,
          total: prev.total + 1,
          successful: prev.successful + 1,
        }));
      }
    } catch (err) {
      setLastScan({
        success: false,
        message: 'Error al procesar QR: ' + err.message,
        qrData: qrData,
        timestamp: Date.now(),
      });
      setStats((prev) => ({
        ...prev,
        total: prev.total + 1,
        failed: prev.failed + 1,
      }));
    }

    setScanning(false);

    setTimeout(() => {
      setLastScan(null);
      setScanning(true);
    }, 3000);
  };

  const sendToWebhook = async (scanData) => {
    const response = await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(scanData),
    });

    const result = await response.json();

    if (response.ok) {
      // ✅ AQUI guardamos invitado en banner superior
      // Esperamos que n8n responda { nombre, email, message, ... }
      if (result?.nombre || result?.email) {
        setCurrentGuest({
          nombre: result?.nombre || '—',
          email: result?.email || '—',
        });
      } else {
        // Si aún no lo devuelve n8n, lo dejas en null y solo verás el mensaje
        setCurrentGuest(null);
      }

      setLastScan({
        success: true,
        message: result.message || 'Asistencia registrada correctamente',
        qrData: scanData.qrData,
        timestamp: Date.now(),
        data: result,
      });

      setStats((prev) => ({
        ...prev,
        total: prev.total + 1,
        successful: prev.successful + 1,
      }));
    } else {
      throw new Error(result.error || 'Error al registrar asistencia');
    }
  };

  const syncPendingScans = async () => {
    if (pendingScans.length === 0) return;

    const remaining = [];
    for (const scan of pendingScans) {
      try {
        await sendToWebhook(scan);
      } catch {
        remaining.push(scan);
      }
    }

    setPendingScans(remaining);
    localStorage.setItem('pendingScans', JSON.stringify(remaining));
  };

  const handleScan = (results) => {
    if (!results || results.length === 0) return;
    const raw = results[0]?.rawValue;
    if (raw) processQRCode(raw);
  };

  const handleError = (error) => console.error(error);

  // ✅ Form handlers
  const onChangeRegister = (e) => {
    const { name, value } = e.target;
    setRegisterForm((prev) => ({ ...prev, [name]: value }));
  };

  const submitRegister = async (e) => {
    e.preventDefault();
    setRegisterError(null);
    setRegisterSuccess(null);

    const payload = {
      nombre: registerForm.nombre?.trim(),
      apellido: registerForm.apellido?.trim(),
      telefono: normalizePhoneMX(registerForm.telefono),
      email: registerForm.email?.trim(),
      eventoVentas: registerForm.eventoVentas?.trim(),
      createdAt: new Date().toISOString(),
      source: 'qr-scanner-app',
    };

    // validación mínima
    if (!payload.nombre || !payload.apellido || !payload.telefono || !payload.email || !payload.eventoVentas) {
      setRegisterError('Completa todos los campos.');
      return;
    }

    if (!isOnline) {
      setRegisterError('Necesitas conexión para registrar un cliente nuevo.');
      return;
    }

    setRegisterLoading(true);
    try {
      const res = await fetch(REGISTER_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await res.json();

      if (!res.ok) throw new Error(json?.error || 'No se pudo registrar');

      setRegisterSuccess(json?.message || 'Cliente registrado correctamente');
      setRegisterForm({ nombre: '', apellido: '', telefono: '', email: '', eventoVentas: '' });
    } catch (err) {
      setRegisterError(err.message || 'Error inesperado');
    } finally {
      setRegisterLoading(false);
    }
  };

  return (
    <div className={`qr-app ${theme === 'dark' ? 'theme-dark' : 'theme-light'}`}>
      {/* HEADER */}
      <header className="qr-header">
        <div className="qr-header-inner">
          <div>
            <div className="qr-header-title">Eventos VEQ</div>
            <div className="qr-header-subtitle">
              Registro de asistentes por código QR
            </div>
          </div>

          <div className="header-actions">
            <div className={'status-badge ' + (isOnline ? 'online' : 'offline')}>
              {isOnline ? <Wifi /> : <WifiOff />}
              {isOnline ? 'En línea' : 'Modo offline'}
            </div>

            {/* ✅ NUEVO: botón registrar cliente */}
            <button
              className="theme-toggle"
              onClick={() => {
                setRegisterError(null);
                setRegisterSuccess(null);
                setShowRegister(true);
              }}
              type="button"
            >
              <UserPlus />
              Registrar cliente
            </button>

            <button className="theme-toggle" onClick={toggleTheme} type="button">
              {theme === 'dark' ? <Sun /> : <Moon />}
              {theme === 'dark' ? 'Claro' : 'Oscuro'}
            </button>
          </div>
        </div>
      </header>

      <main className="qr-main">
        {/* STATS */}
        <section className="stats-grid">
          <div className="stat-card">
            <div className="stat-card-header">
              <div className="stat-label">
                <Users />
                <span>Total escaneos</span>
              </div>
            </div>
            <div className="stat-value">{stats.total}</div>
          </div>

          <div className="stat-card success">
            <div className="stat-card-header">
              <div className="stat-label">
                <CheckCircle />
                <span>Exitosos</span>
              </div>
            </div>
            <div className="stat-value">{stats.successful}</div>
          </div>

          <div className="stat-card error">
            <div className="stat-card-header">
              <div className="stat-label">
                <XCircle />
                <span>Fallidos</span>
              </div>
            </div>
            <div className="stat-value">{stats.failed}</div>
          </div>
        </section>

        {/* PENDIENTES OFFLINE */}
        {pendingScans.length > 0 && (
          <section className="pending-box">
            <Clock />
            <div>
              <div>{pendingScans.length} escaneos pendientes de sincronizar</div>
              <div style={{ fontSize: '0.8rem', opacity: 0.9 }}>
                Cuando vuelva la conexión se enviarán automáticamente.
              </div>
            </div>
          </section>
        )}

        {/* ✅ NUEVO: Banner de invitado arriba del scanner */}
        {currentGuest && (
          <section className="guest-banner">
            <div className="guest-banner-title">Invitado detectado</div>
            <div className="guest-banner-name">{currentGuest.nombre}</div>
            <div className="guest-banner-email">{currentGuest.email}</div>
          </section>
        )}

        {/* SCANNER / RESULTADO */}
        <section className="scanner-card">
          {!scanning && !lastScan && (
            <div className="scanner-idle">
              <div className="scanner-idle-icon">
                <Camera />
              </div>
              <div className="scanner-idle-title">Listo para escanear códigos QR</div>
              <div className="scanner-idle-text">
                Cuando estés frente al código, inicia la cámara y colócalo dentro del
                recuadro luminoso.
              </div>
              <button className="primary-btn" onClick={() => setScanning(true)}>
                <Camera />
                Iniciar escaneo
              </button>
            </div>
          )}

          {scanning && !lastScan && (
            <div className="scanner-live">
              <Scanner
                onScan={handleScan}
                onError={handleError}
                formats={['qr_code']}
                constraints={{ facingMode: 'environment' }}
                styles={{
                  container: { width: '100%', height: '100%' },
                  video: { width: '100%', height: '100%', objectFit: 'cover' },
                }}
              />

              <div className="scan-frame">
                <div className="scan-frame-box" />
              </div>

              <button className="stop-btn" onClick={() => setScanning(false)}>
                <XCircle />
                Detener
              </button>
            </div>
          )}

          {lastScan && (
            <div className={'scan-result ' + (lastScan.success ? 'success' : 'error')}>
              <div className="scan-result-inner">
                <div className="scan-result-icon">
                  {lastScan.success ? <CheckCircle /> : <XCircle />}
                </div>
                <div className="scan-result-title">
                  {lastScan.success ? '¡Registro exitoso!' : 'Error'}
                </div>
                <div className="scan-result-message">{lastScan.message}</div>

                {/* (ya lo tenías) */}
                {lastScan.data?.nombre && (
                  <div className="scan-result-name">{lastScan.data.nombre}</div>
                )}

                <div className="scan-result-hint">Preparando el siguiente escaneo...</div>
              </div>
            </div>
          )}
        </section>

        {/* INSTRUCCIONES */}
        <section className="instructions-card">
          <div className="instructions-title">Instrucciones de uso</div>
          <ul className="instructions-list">
            <li>
              • Presiona <strong>"Iniciar escaneo"</strong> para activar la cámara.
            </li>
            <li>• Coloca el código QR dentro del marco luminoso.</li>
            <li>• El sistema registrará la asistencia automáticamente.</li>
            <li>
              • Si no hay internet, el registro se guarda y se sincroniza cuando vuelva la
              conexión.
            </li>
          </ul>
        </section>
      </main>

      {/* ✅ NUEVO: Modal registrar cliente */}
      {showRegister && (
        <div className="modal-backdrop" onClick={() => setShowRegister(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-title">Registrar cliente (básico)</div>
            <div className="modal-subtitle">
              Se enviará a n8n para seguir el flujo de registro.
            </div>

            <form className="register-form" onSubmit={submitRegister}>
              <div className="form-grid">
                <label className="form-field">
                  <span>Nombre</span>
                  <input
                    name="nombre"
                    value={registerForm.nombre}
                    onChange={onChangeRegister}
                    placeholder="Ej. Juan"
                  />
                </label>

                <label className="form-field">
                  <span>Apellido</span>
                  <input
                    name="apellido"
                    value={registerForm.apellido}
                    onChange={onChangeRegister}
                    placeholder="Ej. Pérez"
                  />
                </label>

                <label className="form-field">
                  <span>Teléfono</span>
                  <input
                    name="telefono"
                    value={registerForm.telefono}
                    onChange={onChangeRegister}
                    placeholder="Ej. 3312345678"
                  />
                </label>

                <label className="form-field">
                  <span>Correo electrónico</span>
                  <input
                    name="email"
                    value={registerForm.email}
                    onChange={onChangeRegister}
                    placeholder="Ej. correo@dominio.com"
                  />
                </label>

                <label className="form-field form-field-full">
                  <span>Evento de ventas</span>
                  <input
                    name="eventoVentas"
                    value={registerForm.eventoVentas}
                    onChange={onChangeRegister}
                    placeholder="Ej. EIE CSI / Open House / etc."
                  />
                </label>
              </div>

              {registerError && <div className="form-alert error">{registerError}</div>}
              {registerSuccess && <div className="form-alert success">{registerSuccess}</div>}

              <div className="modal-actions">
                <button
                  className="theme-toggle"
                  type="button"
                  onClick={() => setShowRegister(false)}
                >
                  Cancelar
                </button>

                <button className="primary-btn" type="submit" disabled={registerLoading}>
                  {registerLoading ? 'Registrando...' : 'Guardar registro'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default QRScannerApp;
