# PMS Pharmacy v4

Pharmacy Management System — desktop app for Sudanese pharmacies with cloud dashboard.

## Stack

- **Desktop**: Tauri 2 + Rust + React + TypeScript + Tailwind CSS + SQLite
- **Cloud**: Node.js + Express + PostgreSQL 16 (Hetzner VPS)
- **PWA**: React + Vite (owner dashboard + admin panel)

## Development

```bash
# Desktop app
npm run tauri dev

# Rust check
cd src-tauri && cargo check

# Cloud API
cd pms-cloud && npm start
```

## Documentation

See `docs/AGENT-HANDOFF.md` for full project context, architecture, and build plans.
