# Hospitality AI

Vertical application for hospitality businesses (hotels, resorts, restaurants, cafés, bars).

## Responsibilities

- Provide UI for hospitality users
- Adapt hospitality concepts to SME OS contracts
- Display alerts and recommendations
- Manage hospitality-specific settings

## Boundaries

- **DO NOT** implement decision logic (delegate to SME OS)
- **DO NOT** include business intelligence calculations
- **DO** use adapters to translate hospitality concepts to SME OS
- **DO** keep UI thin and focused on presentation

## Structure

- `app/` - Application UI and pages
- `services/` - Service layer for API calls
- `styles/` - Application-specific styles
