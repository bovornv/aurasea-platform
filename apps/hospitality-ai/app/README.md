# App

Application UI and pages.

## Responsibilities

- Define page routes and layouts
- Compose UI components
- Handle user interactions
- Manage application state

## Boundaries

- **DO NOT** implement business logic
- **DO NOT** make direct calls to SME OS (use services)
- **DO** use shared UI components from packages/ui
- **DO** keep pages focused on presentation

## Structure

- `pages/` - Page components (login, home, alert, overview, scenario, history, settings)
- `components/` - Application-specific components
- `adapters/` - Adapters for translating hospitality concepts
- `i18n/` - Internationalization configuration
