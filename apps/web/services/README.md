# Services

Service layer for API calls and business operations.

## Responsibilities

- Make API calls to SME OS
- Handle authentication and authorization
- Manage API error handling
- Provide service abstractions

## Boundaries

- **DO NOT** implement decision logic
- **DO NOT** include UI components
- **DO** delegate all decisions to SME OS
- **DO** use adapters to transform data
