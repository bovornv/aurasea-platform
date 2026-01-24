# Adapters Package

Shared adapters for translating vertical concepts to SME OS contracts.

## Responsibilities

- Provide adapters for each vertical
- Translate vertical terminology to generic concepts
- Transform data between vertical and SME OS formats
- Maintain adapter consistency

## Boundaries

- **DO NOT** implement decision logic
- **DO NOT** modify SME OS contracts
- **DO** keep adapters focused on translation
- **DO** support multiple verticals

## Structure

- `hospitality/` - Hospitality-specific adapters
- `retail/` - Retail-specific adapters (placeholder)
- `generic/` - Generic adapters for common patterns
