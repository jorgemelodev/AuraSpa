# 🌸 Aurora — Asistente de Voz + Face ID de AuraSpa

Aurora es la asistente inteligente integrada en todo el sistema: responde por voz
con datos reales de la base de datos, protege el Core con un segundo factor
biométrico y permite al staff verificar la llegada de clientes por rostro.

---

## Arquitectura

```
┌────────────────────── FRONTEND (React + Vite) ──────────────────────┐
│  AuroraKiosk (GLOBAL, montada en App.tsx)                            │
│    ├── useAuroraVoz.ts   wake word + dictado + TTS + anti-feedback   │
│    └── AuroraRing.tsx    anillo morado + logo botánico               │
│  rostro.ts               face-api.js LOCAL → vector 128D (sin fotos) │
│  RegistroRostro.tsx      enrolamiento en Perfil › Seguridad          │
│  CoreFaceGate.tsx        2º factor facial para /core (Admin)         │
│  CheckinCliente.tsx      staff verifica llegada de clientes          │
│  RecepcionAlertas.tsx    alertas SignalR en tiempo real (staff)      │
└──────────────────────────────────────────────────────────────────────┘
                 │ REST                              │ WebSocket
                 ▼                                   ▼
┌────────────────────── BACKEND (ASP.NET Core) ───────────────────────┐
│  AuthController: POST /api/auth/login-rostro (login por Face ID)     │
│  AuroraController                                                    │
│    POST /api/aurora/mensaje           intenciones con datos de BD    │
│    POST /api/aurora/checkin           identifica cliente → alerta    │
│    GET  /api/aurora/rostro/estado     ¿usuario tiene rostro?         │
│    POST /api/aurora/rostro/registrar  guarda descriptor 128D         │
│    DELETE /api/aurora/rostro          elimina registro               │
│    POST /api/aurora/verificar-admin   2º factor del Core (1:1)       │
│  AuroraHub (/hubs/aurora)             grupo "recepcion"              │
│  LocalFaceIdService                   matching por distancia         │
│                                       euclidiana (umbral 0.55)       │
└──────────────────────────────────────────────────────────────────────┘
                 │
                 ▼
     SQL Server — tabla RostroDescriptor (v9): SOLO vectores, sin fotos
```

## Cómo funciona la biometría (sin fotos)

face-api.js (TensorFlow.js) corre **en el navegador**: detecta el rostro y lo
convierte en un **descriptor de 128 números**. Solo ese vector viaja al backend
y se guarda en `RostroDescriptor`. Dos rostros son la misma persona si la
distancia euclidiana entre sus vectores es < **0.55**. Ninguna imagen sale del
dispositivo ni se almacena — alineado con la **Ley 172-13** (datos biométricos).

Los modelos (~6.8 MB) están incluidos en `frontend/aura-spa-ui/public/models`
y funcionan sin internet.

## Activación paso a paso

1. **SQL**: ejecuta `AuraSpa_Upgrade_v8_to_v9.sql` en SSMS (crea `RostroDescriptor`).
2. **Backend**: `dotnet run` en `backend/AuraSpa.Api` (puerto 5036).
3. **Frontend**: `npm install && npm run dev` en `frontend/aura-spa-ui`.
4. Abre `http://localhost:5173` en **Chrome o Edge** y permite micrófono.

### Voz (en toda la app)
- Aurora vive en la burbuja morada (abajo a la derecha) en cualquier página.
- Di **"Hola Aurora"** (español) o **"Hey Aurora"** (inglés), o toca la burbuja.
- Ya **no se escucha a sí misma**: el micrófono se ignora mientras habla
  (+800 ms de margen por el eco).

### Face ID en el inicio de sesión (Admin)
1. Como Admin, registra tu rostro una vez en **Perfil › Seguridad › Registrar mi rostro**.
2. Cierra sesión. En la pantalla de **Login** aparece el botón
   **"Iniciar sesión con Face ID"**: mira a la cámara y entras sin contraseña
   (endpoint `POST /api/auth/login-rostro`, matching 1:N solo contra
   administradores enrolados, umbral estricto 0.50).
3. **La contraseña es el respaldo**: si el rostro no se reconoce, no hay cámara,
   o el Admin no tiene rostro registrado, inicia sesión normal con contraseña.
4. Al entrar por Face ID, el Core ya no vuelve a pedir verificación en esa sesión.
   Si entra por contraseña y tiene rostro registrado, el Core (CoreFaceGate)
   pedirá la verificación facial una vez, como segundo factor.

### Llegada de clientes (staff)
1. El **cliente** registra su rostro una vez en **Perfil › Seguridad** (su cuenta).
2. El staff entra a **Dashboard › Llegada de Clientes** (o dice a Aurora
   "registrar llegada"): apunta la cámara al cliente → si hay match y tiene
   cita hoy, se notifica: recepción recibe al instante
   *"🔔 Acaba de entrar Gabriela, viene a su cita de las 4:00 PM…"* (SignalR +
   tabla Notificacion). Fallback por cédula incluido.

## Decisiones técnicas

| Pieza | Implementación | Nota |
|---|---|---|
| Wake word | Web Speech API (Chrome/Edge, requiere internet) | Upgrade: Picovoice Porcupine |
| Reconocimiento facial | face-api.js local, descriptores 128D | Real, gratis, sin nube |
| Verificación Core | 1:1 (solo contra el propio admin) | Umbral 0.55 |
| Check-in clientes | 1:N (contra todos los enrolados) | Umbral 0.55 |
| Tiempo real | SignalR `/hubs/aurora` | Grupo "recepcion" |

## Archivos del módulo

**Backend**: `Controllers/AuroraController.cs`, `Hubs/AuroraHub.cs`,
`Services/FaceIdService.cs`, `Models/RostroDescriptor.cs`, `DTOs/AuroraDtos.cs`,
`Program.cs`, `Data/ApplicationDbContext.cs` · **SQL**: `AuraSpa_Upgrade_v8_to_v9.sql`

**Frontend**: `components/aurora/` (AuroraKiosk, AuroraRing, useAuroraVoz,
rostro.ts, RegistroRostro, CoreFaceGate, RecepcionAlertas),
`pages/CheckinCliente.tsx`, `pages/Kiosko.tsx`, `App.tsx`, `Perfil.tsx`,
`DashboardStaff.tsx`, `public/models/` (pesos de face-api.js)
