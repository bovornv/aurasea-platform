# Contracts

Public API contracts for vertical apps.

## Responsibilities

- Define input contracts for vertical apps
- Define output contracts from SME OS
- Define alert contracts
- Maintain contract versioning

## Boundaries

- **DO NOT** include implementation details
- **DO NOT** expose internal domain models directly
- **DO** provide clean, stable interfaces
- **DO** abstract away internal complexity

## Files

- `inputs.ts` - Input contract definitions
- `outputs.ts` - Output contract definitions
- `alerts.ts` - Alert contract definitions
