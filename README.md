# DealFlow360 — Self Governing Sales Operations Platform

An intelligent Sales Operations platform designed to handle multi-tier discount governance, live upsell recommendations, multi-warehouse fulfillment splitting, hybrid billing (one-time + recurring subscriptions), deal health monitoring, customer portal negotiation, and backend analytics reporting.

---

## 🚀 Quick Start Guide

### 1. Prerequisites & Installation
```bash
# Clone and install dependencies
npm install
```

### 2. Database Setup & Seeding
```bash
# Initialize Prisma SQLite schema and seed sample data
npx prisma db push
npm run seed
```

### 3. Running the Development Application
```bash
# Start backend Express server (Port 3000) & frontend Vite dev server (Port 5173)
npm run dev
```

- **Frontend URL**: `http://localhost:5173/`
- **Backend API Base**: `http://localhost:3000/`

---

## 🧪 Running Automated Test Suite

```bash
# Run full regression test suite (22 Test Suites, 229 Tests)
npm test
```

---

## 🔑 Demo Credentials

| Role | Email | Password | Access / Features |
|---|---|---|---|
| **Admin** | `admin@dealflow360.com` | `password123` | Backend setup: products, discount tiers, price lists, warehouses, subscriptions |
| **Sales Manager** | `manager@dealflow360.com` | `password123` | Review & approve high-risk quotes, deal health monitoring, discount governance |
| **Finance / Operations** | `finance@dealflow360.com` | `password123` | Level-2 approvals, multi-warehouse fulfillment splits, billing reconciliation |
| **Sales Rep** | `rep.alice@dealflow360.com` | `password123` | Quotation builder, live upsell, discount application, pipeline management |
| **Customer** | `customer@acme.com` | `password123` | Customer Portal negotiation, line comments, counter-proposals |

---

## 📄 Architecture & Documentation

- [ARCHITECTURE.md](file:///Users/vanradhurv/Documents/Projects/DealFlow360/ARCHITECTURE.md) — System Architecture, Entity Relationship Diagram, Module Connectivity & Future Roadmap
- [API_CONTRACT.md](file:///Users/vanradhurv/Documents/Projects/DealFlow360/API_CONTRACT.md) — RESTful API Endpoint Documentation