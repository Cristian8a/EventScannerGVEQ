# Módulo de Pre-Apartado en Tiempo Real

## Estructura actual del workspace (después de este PR)

```
qr-scanner-app/
└── src/
    ├── App.jsx              ← MODIFICADO: router URL-based
    ├── QRScannerApp.jsx     ← SIN CAMBIOS (check-in QR existente)
    ├── QRScannerApp.css     ← SIN CAMBIOS
    ├── ApartadoApp.jsx      ← NUEVO: módulo pre-apartado
    ├── ApartadoApp.css      ← NUEVO: estilos del módulo
    └── main.jsx             ← SIN CAMBIOS

VEQ-PreApartado-n8n-workflow.json  ← NUEVO: flujo n8n a importar
```

---

## Cómo funciona el routing

`App.jsx` detecta la ruta sin necesidad de react-router:

| URL | Componente |
|-----|-----------|
| `app.veq.mx/` | `QRScannerApp` (scanner QR existente) |
| `app.veq.mx/apartado` | `ApartadoApp` |
| `app.veq.mx/?invitadoId=...&oppId=...` | `ApartadoApp` (por query params) |
| `app.veq.mx/apartado?invitadoId=...&oppId=...&token=...` | `ApartadoApp` |

---

## Link personalizado que genera n8n

Después del check-in, el flujo existente en n8n debe generar y enviar por WhatsApp/email el link:

```
https://app.veq.mx/apartado?invitadoId={Invitados__c.Id}&oppId={Opportunity.Id}&token={HASH}&eventId={Evento.Id}
```

El `token` puede ser el mismo `HASH` que ya se usa en el QR actual.

---

## Flujo técnico completo (7 pasos)

```
[Staff escanea QR] → [n8n: check-in] → [Link personalizado → WhatsApp]
        ↓
[Asesor abre /apartado?invitadoId=&oppId=]
        ↓
[ApartadoApp: POST /apartado/catalogo → n8n devuelve inventario + contexto + contador]
        ↓
[Asesor selecciona unidad → formulario pre-apartado]
        ↓
[POST /apartado/verificar → anti-colisión en SF]
        ↓
[POST /apartado/confirmar → 7 operaciones atómicas en SF]
   A. Crear OpportunityLineItem
   B. Update Opportunity Stage → "Apartado"
   C. Update Unidades__c Status → "Apartado"
   D. Incrementar Eventos__c.Apartados_Actuales__c
   E. ¿Umbral alcanzado? → Actualizar Precio_Lista_Vigente__c
   F. Email notificación al cliente
        ↓
[Pantalla de confirmación con ID de operación]
```

---

## Campos de Salesforce requeridos

### Objeto: `Unidades__c`
| Campo | Tipo | Descripción |
|-------|------|-------------|
| `Status__c` | Picklist | `Disponible`, `Apartado`, `Vendido` |
| `Torre__c` | Text | Torre o edificio |
| `Tipo__c` | Text | Departamento, Casa, etc. |
| `Metros_Cuadrados__c` | Number | Superficie |
| `Recamaras__c` | Number | Número de recámaras |
| `Precio_Lista__c` | Currency | Precio vigente |
| `Monto_Apartado__c` | Currency | Monto del apartado |
| `Opportunity__c` | Lookup(Opportunity) | Oportunidad vinculada |

### Objeto: `Eventos__c`
| Campo | Tipo | Descripción |
|-------|------|-------------|
| `Apartados_Actuales__c` | Number | Contador de apartados del evento |
| `Umbral_Apartados__c` | Number | Número de apartados para subir precio |
| `Precio_Lista_Vigente__c` | Currency | Precio en vigor durante el evento |
| `Incremento_Precio_Pct__c` | Percent | % de incremento al alcanzar umbral |

### Objeto: `OpportunityLineItem` (estándar SF)
Campos custom a agregar:
| Campo | Tipo |
|-------|------|
| `Monto_Apartado__c` | Currency |
| `Enganche_Pct__c` | Percent |
| `Financiamiento_Pct__c` | Percent |
| `Entrega_Pct__c` | Percent |
| `Mensualidades__c` | Number |
| `Fecha_Mensualidad__c` | Date |

---

## n8n: Importar workflow nuevo

1. Abre tu instancia n8n
2. Click **Import from file** → selecciona `VEQ-PreApartado-n8n-workflow.json`
3. Asigna las credenciales existentes:
   - `Salesforce account` → `8jOGs5nSLK0iLTal` (ya existe)
   - `SMTP account` → `ytKDxz0pgOuSSdtt` (ya existe)
4. Activa los 3 webhooks:
   - `POST /apartado/catalogo`
   - `POST /apartado/verificar`
   - `POST /apartado/confirmar`

### Cambios al flujo existente (`VEQ - Check-in Evento`)

En el nodo **"Responder al Scanner"**, agregar en la respuesta el campo `apartadoUrl`:

```javascript
// En el nodo "Responder al Scanner" → agregar al JSON de respuesta:
apartadoUrl: `https://app.veq.mx/apartado?invitadoId=${invitadoId}&oppId=${oppId}&token=${hash}&eventId=${eventId}`
```

Opcionalmente, el link también puede enviarse por WhatsApp en el nodo **"Send a Message"** (que ya existe) como mensaje adicional post check-in.

---

## Variables de entorno (ApartadoApp.jsx)

Busca la constante `API_BASE` en `ApartadoApp.jsx` y cámbiala a tu URL de n8n:

```javascript
const API_BASE = 'https://grupo-veq-n8n-grupo-veq.adsfsj.easypanel.host/webhook';
```

---

## ID de Operación generado

El backend n8n genera IDs con el formato:
```
EV-VEQ-{OPP_SHORT}-{TIMESTAMP_B36}
```
Ejemplo: `EV-VEQ-A101-001`

---

## Consideraciones de anti-colisión

El endpoint `/apartado/verificar` hace un `GET` directo al objeto `Unidades__c` en Salesforce justo antes de confirmar. Si dos asesores intentan apartar la misma unidad simultáneamente:

- El primero en llegar al paso "Confirmar" ganará
- El segundo recibirá `{ disponible: false }` → frontend muestra error y recarga catálogo

Para mayor robustez en eventos con >100 asesores simultáneos, hay que considerar implementar un **Platform Event** de SF o un **mutex** en Redis/n8n.