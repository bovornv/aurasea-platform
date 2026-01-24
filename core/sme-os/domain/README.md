# Domain

Core domain models and business logic.

## Responsibilities

- Define generic business concepts (cash, risk, labor, forecast, decision-memory)
- Implement domain rules and validations
- Maintain domain invariants
- Provide domain services

## Boundaries

- **DO NOT** include hospitality or retail specific concepts
- **DO NOT** include UI or presentation logic
- **DO** use generic terminology (e.g., "revenue" not "room revenue")
- **DO** keep domain logic pure and testable

## Subdomains

- `cash/` - Cash flow and financial domain
- `risk/` - Risk assessment and management
- `labor/` - Labor planning and optimization
- `forecast/` - Forecasting and prediction models
- `decision-memory/` - Decision history and learning
