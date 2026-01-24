# Architectural Boundaries

## SME OS Will NEVER Do

### Domain Violations
- Use hospitality terminology (e.g., "ADR", "RevPAR", "occupancy", "room nights")
- Use retail terminology (e.g., "SKU", "inventory turnover", "foot traffic")
- Reference specific business types (hotels, restaurants, stores)
- Include vertical-specific business rules

### UI & Presentation
- Render UI components
- Format data for display
- Handle user interactions
- Manage UI state
- Generate HTML, CSS, or visual layouts

### Data Source Assumptions
- Assume specific data sources (POS systems, PMS, etc.)
- Include data fetching logic
- Handle API integrations
- Manage database connections
- Parse file formats

### Business Logic Violations
- Implement optimization algorithms (pricing, staffing, etc.)
- Generate dashboards or analytics views
- Create AI chat interfaces
- Build configuration panels
- Add gamification or scoring mechanisms

### Communication
- Communicate directly with external systems
- Send emails or notifications
- Make HTTP requests
- Access databases directly
- Handle authentication/authorization

## Hospitality AI Will NEVER Do

### Decision Logic
- Implement decision intelligence
- Evaluate scenarios independently
- Generate recommendations
- Calculate risk scores
- Perform forecasting
- Apply business rules for decisions

### Domain Logic
- Implement cash flow calculations
- Perform risk assessments
- Calculate labor optimization
- Generate forecasts
- Maintain decision memory

### Business Intelligence
- Create dashboards or analytics
- Build optimization tools
- Implement pricing algorithms
- Generate staffing recommendations
- Create comparison views

### Direct SME OS Access
- Bypass adapter layer
- Call SME OS internals directly
- Modify SME OS contracts
- Access SME OS domain models
- Change SME OS behavior

### Data Processing
- Process raw business data for decisions
- Normalize data beyond basic formatting
- Validate business rules
- Apply domain transformations

## What Each Layer DOES Do

### SME OS Does
- Evaluates scenarios using domain models
- Generates alerts based on thresholds
- Maintains decision memory
- Provides confidence scores
- Explains decisions generically
- Exposes clean contracts

### Hospitality AI Does
- Collects user inputs
- Translates hospitality concepts via adapters
- Displays alerts and outputs
- Manages UI state and interactions
- Handles authentication
- Manages user preferences
- Formats data for display

### Adapters Do
- Translate hospitality → generic (input direction)
- Translate generic → hospitality (output direction)
- Map data structures
- Normalize formats
- Validate translations
