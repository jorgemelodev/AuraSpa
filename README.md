<div align="center">

# 🌸 AuraSpa — Sistema de Gestión para Spa

**Plataforma web integral para la gestión de citas, punto de venta, inventario y clientes de un spa,
con asistente de voz y verificación biométrica facial.**

[![Demo en vivo](https://img.shields.io/badge/Demo-aura--spa.vercel.app-8b5cf6?style=for-the-badge&logo=vercel&logoColor=white)](https://aura-spa.vercel.app)
[![Repositorio](https://img.shields.io/badge/GitHub-jorgemelodev%2FAuraSpa-181717?style=for-the-badge&logo=github)](https://github.com/jorgemelodev/AuraSpa)

![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)
![TypeScript](https://img.shields.io/badge/TypeScript-6-3178C6?logo=typescript&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-8-646CFF?logo=vite&logoColor=white)
![.NET](https://img.shields.io/badge/.NET-10-512BD4?logo=dotnet&logoColor=white)
![SQL Server](https://img.shields.io/badge/SQL%20Server-CC2927?logo=microsoftsqlserver&logoColor=white)

### 🔗 [Ver demo en vivo → aura-spa.vercel.app](https://aura-spa.vercel.app)

</div>

---

## 📑 Tabla de contenido

- [Descripción](#-descripción)
- [Mi rol en el proyecto](#-mi-rol-en-el-proyecto)
- [Funcionalidades principales](#-funcionalidades-principales)
- [Stack tecnológico](#-stack-tecnológico)
- [Arquitectura](#-arquitectura)
- [Instalación y ejecución local](#-instalación-y-ejecución-local)
- [Estructura del proyecto](#-estructura-del-proyecto)
- [Créditos](#-créditos)

---

## 📖 Descripción

**AuraSpa** es un sistema de gestión completo para un spa, desarrollado como proyecto académico del
**Equipo 5 · IDS325L-01 · INTEC (2026)**. Cubre el ciclo completo del negocio: desde que un cliente
explora el catálogo y agenda una cita, hasta el cobro en caja, la emisión de comprobantes fiscales,
el control de inventario y los reportes administrativos.

Incluye además **Aurora**, una asistente de voz integrada en toda la aplicación, y un módulo de
**Face ID** que funciona completamente en el navegador (solo se almacenan vectores numéricos, nunca
fotografías).

> Este repositorio es un *fork* del proyecto original del equipo
> ([Gabrielabdp/AuraSpa](https://github.com/Gabrielabdp/AuraSpa)), mantenido como pieza de portafolio.

---

## 👨‍💻 Mi rol en el proyecto

**Jorge Melo** — **Desarrollador Frontend (React + TypeScript)** y **Aseguramiento de Calidad (QA)**

### 🎨 Desarrollo Frontend — React y TypeScript

- Desarrollo e integración de las vistas de la SPA con **React 19 + TypeScript** sobre **Vite**:
  catálogo, agendamiento, carrito de productos, punto de venta, caja, cuentas por cobrar,
  dashboards de cliente y staff, y panel administrativo (Core).
- **Conexión del frontend con la API REST** (Axios + JWT): migración de pantallas que usaban datos
  simulados a **endpoints reales** (Punto de Venta, Core, notificaciones, sucursales, clientes).
- Flujos de autenticación: inicio de sesión, registro con login automático, **verificación en dos
  pasos (2FA)**, cambio y recuperación de contraseña.
- Lógica de **disponibilidad de horarios aislada por especialista** y manejo de días no laborables
  en el agendamiento.
- Mejoras de UX: notificaciones *toast*, preselección de servicio al agendar, filtros por tipo y
  normalización de categorías en el catálogo, imágenes servidas desde la base de datos y rediseño
  del catálogo según el prototipo.
- Separación de módulos para mayor claridad funcional (p. ej. **Cuentas por Cobrar** independiente
  de **Caja**).

### ✅ Aseguramiento de Calidad (QA)

- Diseño y ejecución de **casos de prueba funcionales** sobre los flujos críticos del sistema
  (agendamiento, gestión de citas, login/registro, catálogo, caja y dashboards).
- **Detección, documentación y corrección de defectos** encontrados durante las pruebas — por
  ejemplo, la corrección de 5 defectos en agendamiento y gestión de citas, y el cierre de los
  pendientes finales en login, registro, catálogo y dashboard.
- **Validaciones de integridad de datos**: cédula única, prevención de `nombre_usuario` nulo
  duplicado, conservación del email en errores de login.
- Pruebas de regresión tras la integración de ramas y resolución de conflictos de *merge*,
  verificando que los flujos de login, registro y catálogo se mantuvieran estables.
- Verificación de integraciones externas: envío de correos con **SendGrid**, notificaciones en
  base de datos y validación correcta del **2FA**.

---

## ✨ Funcionalidades principales

| Módulo | Descripción |
|---|---|
| 🗓️ **Agendamiento de citas** | Reserva por servicio, sucursal y especialista con disponibilidad en tiempo real. |
| 🛍️ **Catálogo y carrito** | Servicios, productos y paquetes con imágenes, filtros y reservas de productos. |
| 💳 **Punto de Venta y Caja** | Cobros, apertura/cierre de caja y comprobantes fiscales (NCF). |
| 📒 **Cuentas por Cobrar** | Seguimiento de saldos pendientes de clientes. |
| 📦 **Inventario** | Control de existencias de productos. |
| 📊 **Dashboards y reportes** | Paneles por perfil (Cliente, Especialista, Cajero, Admin) con gráficos. |
| 🔐 **Seguridad** | JWT, contraseñas con BCrypt, 2FA (TOTP) y recuperación por correo. |
| 🎙️ **Aurora (asistente de voz)** | Activación con *"Hola Aurora"*, responde con datos reales de la BD. |
| 🙂 **Face ID** | Login biométrico para administradores y check-in de clientes, procesado localmente. |
| 🔔 **Notificaciones en tiempo real** | Alertas a recepción vía SignalR cuando llega un cliente. |

---

## 🛠️ Stack tecnológico

### Frontend
| Tecnología | Uso |
|---|---|
| **React 19** | Librería de interfaz de usuario |
| **TypeScript** | Tipado estático |
| **Vite** | Herramienta de build y servidor de desarrollo |
| **React Router** | Enrutamiento de la SPA |
| **Axios** | Cliente HTTP para la API REST |
| **Framer Motion** | Animaciones e interacciones |
| **Recharts** | Gráficos de dashboards y reportes |
| **Lucide React** | Iconografía |
| **@microsoft/signalr** | Comunicación en tiempo real |
| **@vladmandic/face-api** | Reconocimiento facial en el navegador (TensorFlow.js) |
| **jsPDF** · **qrcode.react** | Generación de PDF y códigos QR |
| **ESLint** · **typescript-eslint** | Calidad y consistencia del código |

### Backend
| Tecnología | Uso |
|---|---|
| **ASP.NET Core (.NET 10)** | API REST |
| **Entity Framework Core** | ORM sobre SQL Server |
| **SignalR** | Hub de notificaciones en tiempo real |
| **JWT Bearer** | Autenticación |
| **BCrypt.Net** | Hash de contraseñas |
| **Otp.NET** | Segundo factor de autenticación (TOTP) |
| **SendGrid** | Envío de correos transaccionales |
| **Swagger / OpenAPI** | Documentación de la API |

### Base de datos y despliegue
- **SQL Server** (SSMS) con *stored procedures* y scripts de migración versionados.
- **Vercel** para el despliegue del frontend.

---

## 🏗️ Arquitectura

```
┌──────────────── FRONTEND (React + TypeScript + Vite) ────────────────┐
│  Páginas · Componentes · AuthContext · Servicios (Axios)             │
│  Aurora (voz) · Face ID (face-api.js local → vector 128D)            │
└──────────────────────────────────────────────────────────────────────┘
            │ REST (JWT)                         │ WebSocket (SignalR)
            ▼                                    ▼
┌──────────────────────── BACKEND (ASP.NET Core) ──────────────────────┐
│  Controllers: Auth, Citas, Catálogo, Caja, Inventario, Dashboard,    │
│               Comprobante Fiscal, Aurora …                           │
│  Hubs: AuroraHub  ·  Services: FaceId, Email (SendGrid)              │
└──────────────────────────────────────────────────────────────────────┘
            │ Entity Framework Core
            ▼
                    SQL Server (tablas + stored procedures)
```

---

## 🚀 Instalación y ejecución local

### Requisitos previos
- [Node.js](https://nodejs.org/) 20 o superior
- [.NET SDK 10](https://dotnet.microsoft.com/)
- SQL Server + SQL Server Management Studio (SSMS)

### 1. Clonar el repositorio
```bash
git clone https://github.com/jorgemelodev/AuraSpa.git
cd AuraSpa
```

### 2. Base de datos
Ejecuta en SSMS el script de esquema, los *stored procedures*, los datos de prueba y luego los
scripts `AuraSpa_Upgrade_vX_to_vY.sql` en orden ascendente. El detalle está en [LEEME.md](LEEME.md).

### 3. Backend
```bash
cd backend/AuraSpa.Api
dotnet restore
dotnet run
```
API: `http://localhost:5036` · Swagger: `http://localhost:5036/swagger`

> Configura tu cadena de conexión local en `appsettings.Development.json` (no se versiona).

### 4. Frontend
```bash
cd frontend/aura-spa-ui
npm install
npm run dev
```
App: `http://localhost:5173`

> Para Aurora y Face ID usa **Chrome o Edge** y concede permisos de micrófono y cámara.
> Más detalles en [AURORA_README.md](AURORA_README.md).

---

## 📂 Estructura del proyecto

```
AuraSpa/
├── backend/
│   └── AuraSpa.Api/           # API REST en ASP.NET Core (.NET 10)
│       ├── Controllers/
│       ├── DTOs/
│       ├── Data/              # DbContext + seeder
│       ├── Hubs/              # SignalR
│       ├── Models/
│       └── Services/
├── frontend/
│   └── aura-spa-ui/           # SPA en React + TypeScript + Vite
│       ├── public/models/     # Modelos de face-api.js
│       └── src/
│           ├── components/
│           ├── context/
│           ├── pages/
│           ├── services/
│           └── utils/
├── AuraSpa_*.sql              # Esquema, stored procedures, seed y migraciones
├── LEEME.md                   # Guía detallada de instalación
└── AURORA_README.md           # Documentación del módulo Aurora + Face ID
```

---

## 🤝 Créditos

Proyecto desarrollado por el **Equipo 5 — IDS325L-01, INTEC (2026)**.

- **Jorge Melo** — Desarrollador Frontend (React + TypeScript) y QA ·
  [@jorgemelodev](https://github.com/jorgemelodev)
- Repositorio original del equipo: [Gabrielabdp/AuraSpa](https://github.com/Gabrielabdp/AuraSpa)

---

<div align="center">

⭐ Si este proyecto te resulta interesante, ¡no dudes en dejar una estrella!

</div>
