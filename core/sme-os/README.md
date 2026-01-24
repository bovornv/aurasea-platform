# SME OS

Core intelligence engine - the protected brain of the platform.

## Responsibilities

- Contains all decision intelligence logic
- Provides generic domain models (cash, risk, labor, forecast, decision-memory)
- Evaluates scenarios and generates recommendations
- Maintains decision memory and learning
- Exposes contracts (inputs/outputs/alerts) to vertical apps

## Boundaries

- **DO NOT** include hospitality or retail terminology
- **DO NOT** include UI components or styling
- **DO NOT** include vertical-specific adapters
- **DO** use generic business concepts only
- **DO** expose clean contracts for vertical apps to consume

## Structure

- `domain/` - Core domain models and business logic
- `engine/` - Decision evaluation and scoring engines
- `contracts/` - Public API contracts for vertical apps
- `utils/` - Shared utilities
- `tests/` - Test suites
