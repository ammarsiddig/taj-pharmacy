# TAJ Pharmacy v4

Pharmacy Management System for Sudanese pharmacies — desktop application with cloud owner dashboard.

## Stack

| Layer | Technology |
|-------|------------|
| Desktop | Tauri 2 + Rust + React 18 + TypeScript + Tailwind CSS v4 + SQLite |
| Cloud API | Node.js + Express + PostgreSQL 16 |
| PWA | React + Vite (owner dashboard + admin panel) |

## Prerequisites

- **Windows**: Visual Studio 2022 Build Tools (C++), WebView2
- **Node.js**: 18+
- **Rust**: latest stable (`rustup update stable`)
- **PostgreSQL**: 16 (cloud only)
- **Tauri CLI**: `npm install -g @tauri-apps/cli`

## Development Setup

```bash
git clone https://github.com/ammarsiddig/pms-pharmacy-v4.git
cd pms-pharmacy-v4
npm install
```

### Desktop App

```bash
npm run tauri dev        # Launch desktop app in dev mode
```

### Rust Check

```bash
cd src-tauri
cargo check              # Fast compile check (no binary)
cargo build              # Full build
```

### Cloud API

```bash
cd pms-cloud
cp .env.example .env     # Configure database and secrets
npm install
npm start                # Starts Express API on port 3000
```

### PWA (Owner Dashboard + Admin Panel)

```bash
cd pms-cloud/web
npm install
npm run dev              # Vite dev server
npm run build            # Production build → web-dist/
```

## Production Build

```bash
npm run tauri build      # Builds Windows NSIS installer
```

Output: `src-tauri/target/release/bundle/nsis/TAJ Pharmacy_x.x.x_x64-setup.exe`

## Deployment

Cloud deployment uses Docker Compose on the VPS:

```bash
cd pms-cloud
npm run deploy           # Builds PWA, copies to VPS, rebuilds Docker, reloads Nginx
```

The VPS runs:
- `pms-postgres` — PostgreSQL 16
- `pms-api` — Node.js Express (port 3000)
- Nginx — reverse proxy + static PWA at `taj.systems`

## Architecture

```
├── src/                     # React desktop app
│   ├── api/                 # Tauri invoke() wrappers
│   ├── components/          # Reusable UI components
│   ├── hooks/               # React hooks
│   ├── i18n/                # ar.json + en.json
│   ├── pages/               # Page components
│   └── types/               # TypeScript types
├── src-tauri/               # Rust backend
│   └── src/
│       ├── commands/        # Tauri command handlers
│       ├── db/              # SQLite queries + migrations
│       └── models/          # Domain logic
└── pms-cloud/               # Cloud server
    ├── src/
    │   ├── routes/          # Express API routes
    │   ├── auth.js          # Authentication middleware
    │   └── db.js            # PostgreSQL client
    ├── migrations/          # PostgreSQL schema
    └── web/                 # PWA (React + Vite)
```

## Database

- **Desktop**: SQLite via `rusqlite`. Migrations are additive only (no breaking changes).
- **Cloud**: PostgreSQL 16. Sync is table-snapshot based (desktop pushes changed rows).
- **Money**: All amounts stored as integer piasters (x100), formatted for display via `api.formatMoney()`.

## Internationalization

Arabic and English supported. Keys in `src/i18n/ar.json` and `src/i18n/en.json`. RTL-first layout using `ms-*`/`me-*` Tailwind classes.

## License

Proprietary — TAJ Pharmacy management system.
