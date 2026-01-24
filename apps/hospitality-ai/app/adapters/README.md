# Adapters

Adapters for translating hospitality concepts to SME OS contracts.

## Responsibilities

- Translate hospitality terminology to SME OS inputs
- Transform SME OS outputs to hospitality concepts
- Map hospitality data models to generic models
- Handle hospitality-specific data transformations

## Boundaries

- **DO NOT** implement decision logic
- **DO NOT** modify SME OS contracts
- **DO** use packages/adapters/hospitality for shared adapters
- **DO** keep adapters focused on translation only
