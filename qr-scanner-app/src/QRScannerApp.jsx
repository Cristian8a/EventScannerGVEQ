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

  const WEBHOOK_URL = 'https://starknbn.ddns.net/webhook/scan-qr';

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    const saved = localStorage.getItem('pendingScans');
    if (saved) {
      setPendingScans(JSON.parse(saved));
    }

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  useEffect(() => {
    if (isOnline && pendingScans.length > 0) {
      syncPendingScans();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOnline]);

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
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(scanData),
    });

    const result = await response.json();

    if (response.ok) {
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

    const first = results[0];
    const raw = first.rawValue;

    if (raw) {
      processQRCode(raw);
    }
  };

  const handleError = (error) => {
    console.error(error);
  };

  return (
    <div className="qr-app">
      {/* HEADER */}
      <header className="qr-header">
        <div className="qr-header-inner">
          <div>
            <div className="qr-header-title">Eventos VEQ</div>
            <div className="qr-header-subtitle">
              Registro de asistentes por código QR
            </div>
          </div>

          <div
            className={
              'status-badge ' + (isOnline ? 'online' : 'offline')
            }
          >
            {isOnline ? <Wifi /> : <WifiOff />}
            {isOnline ? 'En línea' : 'Modo offline'}
          </div>
        </div>
      </header>

      {/* CONTENIDO PRINCIPAL */}
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
              <div>
                {pendingScans.length} escaneos pendientes de sincronizar
              </div>
              <div style={{ fontSize: '0.8rem', opacity: 0.9 }}>
                Cuando vuelva la conexión se enviarán automáticamente.
              </div>
            </div>
          </section>
        )}

        {/* SCANNER / RESULTADO */}
        <section className="scanner-card">
          {/* Estado inicial */}
          {!scanning && !lastScan && (
            <div className="scanner-idle">
              <div className="scanner-idle-icon">
                <Camera />
              </div>
              <div className="scanner-idle-title">
                Listo para escanear códigos QR
              </div>
              <div className="scanner-idle-text">
                Cuando estés frente al código, inicia la cámara y
                colócalo dentro del recuadro luminoso.
              </div>
              <button
                className="primary-btn"
                onClick={() => setScanning(true)}
              >
                <Camera />
                Iniciar escaneo
              </button>
            </div>
          )}

          {/* Escaneando */}
          {scanning && !lastScan && (
            <div className="scanner-live">
              <Scanner
                onScan={handleScan}
                onError={handleError}
                formats={['qr_code']}
                constraints={{ facingMode: 'environment' }}
                styles={{
                  container: { width: '100%', height: '100%' },
                  video: {
                    width: '100%',
                    height: '100%',
                    objectFit: 'cover',
                  },
                }}
              />

              <div className="scan-frame">
                <div className="scan-frame-box" />
              </div>

              <button
                className="stop-btn"
                onClick={() => setScanning(false)}
              >
                <XCircle />
                Detener
              </button>
            </div>
          )}

          {/* Resultado último escaneo */}
          {lastScan && (
            <div
              className={
                'scan-result ' +
                (lastScan.success ? 'success' : 'error')
              }
            >
              <div className="scan-result-inner">
                <div className="scan-result-icon">
                  {lastScan.success ? <CheckCircle /> : <XCircle />}
                </div>
                <div className="scan-result-title">
                  {lastScan.success ? '¡Registro exitoso!' : 'Error'}
                </div>
                <div className="scan-result-message">
                  {lastScan.message}
                </div>
                {lastScan.data?.nombre && (
                  <div className="scan-result-name">
                    {lastScan.data.nombre}
                  </div>
                )}
                <div className="scan-result-hint">
                  Preparando el siguiente escaneo...
                </div>
              </div>
            </div>
          )}
        </section>

        {/* INSTRUCCIONES */}
        <section className="instructions-card">
          <div className="instructions-title">Instrucciones de uso</div>
          <ul className="instructions-list">
            <li>
              • Presiona <strong>"Iniciar escaneo"</strong> para activar la
              cámara.
            </li>
            <li>• Coloca el código QR dentro del marco luminoso.</li>
            <li>• El sistema registrará la asistencia automáticamente.</li>
            <li>
              • Si no hay internet, el registro se guarda y se sincroniza
              cuando vuelva la conexión.
            </li>
          </ul>
        </section>
      </main>
    </div>
  );
};

export default QRScannerApp;
