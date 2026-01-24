# Aurasea Platform

Decision intelligence platform with SME OS core and vertical applications.

## Core Principles

- **SME OS** is the protected core brain - all decision intelligence lives here
- **Vertical apps** are thin shells - no business logic, only UI and adapters
- **No domain terminology** in SME OS - generic concepts only (cash, risk, labor, forecast)
- **No decision logic** in vertical apps - all decisions delegated to SME OS
- **Web app only** - desktop-first design
- **Thai-first** - English optional
- **Stripe + Linear style** - calm, minimal aesthetic

## Structure

- `core/sme-os/` - Core intelligence engine (protected)
- `apps/` - Vertical applications (hospitality-ai, retail-ai)
- `packages/` - Shared packages (ui, adapters, i18n)
- `docs/` - Documentation
- `infra/` - Infrastructure configuration

## Getting Started

### Prerequisites

- Node.js 18+ 
- npm or yarn

### Setup

```bash
# Install dependencies
npm install

# Run Hospitality AI development server
cd apps/hospitality-ai
npm run dev
```

Visit http://localhost:3000/home to see the decision feed.

## Development

- `main` branch - stable, reviewable code
- `develop` branch - daily work
- `feature/*` branches - short-lived experiments

See `docs/architecture/git-workflow.md` for details.

## Architecture

See `docs/architecture/` for:
- Data flow documentation
- Contract definitions
- Boundary definitions
- Git workflow
