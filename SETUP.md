# MSG - WhatsApp Clone Setup Guide

## Overview

MSG is a full-featured messaging application similar to WhatsApp, built with:
- **Backend:** NestJS, MongoDB, Redis, Socket.io
- **Frontend:** React, Vite, Tailwind CSS, Zustand

## Installed Technologies

### Backend (apps/api)
- **NestJS** – Node.js framework
- **Mongoose** – MongoDB ODM
- **Passport** – Authentication (JWT, Local)
- **Socket.io** – Real-time WebSockets
- **ioredis** – Redis client
- **bcrypt** – Password hashing
- **class-validator** – Request validation
- **helmet** – Security headers
- **compression** – Response compression
- **@nestjs/throttler** – Rate limiting

### Frontend (apps/web)
- **React 18** – UI library
- **Vite** – Build tool
- **TypeScript** – Type safety
- **Tailwind CSS** – Styling
- **React Router** – Routing
- **Zustand** – State management
- **Socket.io-client** – Real-time
- **Axios** – HTTP client
- **Lucide React** – Icons
- **simple-peer** – WebRTC for calls

---

## Prerequisites

### 1. Node.js (v18+)
```bash
node --version  # Should be 18.x or higher
```

### 2. MongoDB
```bash
# macOS (Homebrew)
brew tap mongodb/brew
brew install mongodb-community
brew services start mongodb-community

# Or Docker
docker run -d -p 27017:27017 --name mongodb mongo:latest
```

### 3. Redis (optional)
```bash
# macOS (Homebrew)
brew install redis
brew services start redis

# Or Docker
docker run -d -p 6379:6379 --name redis redis:alpine
```

---

## Quick Start

### 1. Install dependencies
```bash
npm install
```

### 2. Configure environment
```bash
cp apps/api/.env.example apps/api/.env
# Edit apps/api/.env with your settings
```

### 3. Seed test users (required for adding contacts)
```bash
# Ensure MongoDB is running, then:
npm run seed -w @msg/api
# Creates 6 test users: Test User, Mani, Sarah, John, Priya, Rahul (all password: Test123)
# Search by name (e.g. "Mani") or phone (e.g. "9876543210") to add contacts and start chats
```

### 4. Start development servers
```bash
npm run dev
```

- **API:** http://localhost:3000
- **Web:** http://localhost:5173 (open this in browser for login)

### 5. Build for production
```bash
npm run build
```

---

## Environment Variables

### Backend (apps/api/.env)
```
PORT=3000
MONGODB_URI=mongodb://localhost:27017/msg
REDIS_HOST=localhost
REDIS_PORT=6379
JWT_SECRET=your-secret-key-change-in-production
API_URL=http://localhost:3000
CORS_ORIGIN=http://localhost:5173
```

---

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start API + Web (development) |
| `npm run dev:api` | Start API only |
| `npm run dev:web` | Start Web only |
| `npm run build` | Build both for production |
| `npm run seed -w @msg/api` | Create 6 test users (all password: Test123) |
| `npm run test:e2e` | Run E2E tests (from apps/web) |

---

## Project Structure

```
projectmeta/
├── apps/
│   ├── api/                 # NestJS backend
│   │   ├── src/
│   │   │   ├── auth/        # Authentication
│   │   │   ├── users/       # User & contacts
│   │   │   ├── conversations/
│   │   │   ├── messages/
│   │   │   ├── groups/
│   │   │   ├── media/
│   │   │   ├── calls/
│   │   │   ├── status/
│   │   │   └── events/      # WebSocket gateway
│   │   └── uploads/         # Media files
│   └── web/                 # React frontend
│       ├── src/
│       │   ├── api/
│       │   ├── components/
│       │   ├── pages/
│       │   ├── store/
│       │   └── hooks/
│       └── e2e/              # Playwright tests
├── docs/
│   └── API.md               # API documentation
├── WHATSAPP_APP_DESIGN_AND_ARCHITECTURE.md
└── SETUP.md
```

---

## Features

- **Auth:** Register, login, JWT
- **Chat:** Direct & group messaging, real-time
- **Media:** Images, videos, documents
- **Groups:** Create, add/remove members, admin controls
- **Calls:** Voice & video (WebRTC)
- **Status:** Text, image, video stories (24h expiry)

---

## Troubleshooting

### "No users found" when adding contacts
- Run `npm run seed -w @msg/api` to create test users
- Search by name (Mani, Sarah, John) or phone (9876543210)
- Ensure the API is running (`npm run dev` or `npm run dev:api`)

### "Failed to add contact" / "Failed to start chat"
- Ensure MongoDB is running on port 27017
- Ensure the API is running on port 3000
- Check the browser console (F12) for network errors
- Verify you're logged in (token may have expired – try logging in again)

### Blank screen after login
- Clear browser storage and log in again
- Ensure both API and Web are running

---

## E2E Testing

Requires MongoDB running. From project root:

```bash
cd apps/web && npm run test:e2e
```

Or with UI:
```bash
cd apps/web && npm run test:e2e:ui
```

---

## Documentation

- [API Reference](docs/API.md)
- [Architecture](WHATSAPP_APP_DESIGN_AND_ARCHITECTURE.md)
