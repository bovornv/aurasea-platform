# Hospitality Adapters

Adapters for translating hospitality concepts to SME OS contracts.

## Responsibilities

- Translate hospitality terminology (e.g., "ADR", "occupancy") to generic concepts
- Transform hospitality data models to SME OS inputs
- Convert SME OS outputs to hospitality concepts
- Handle hospitality-specific data mappings

## Boundaries

- **DO NOT** implement decision logic
- **DO NOT** modify SME OS contracts
- **DO** keep adapters pure and testable
- **DO** support all hospitality business types (hotels, restaurants, etc.)
