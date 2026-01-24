# Data Flow: Hospitality AI ↔ SME OS

## Flow Direction

```
Hospitality AI → Adapter Layer → SME OS → Adapter Layer → Hospitality AI
```

## Detailed Flow

### 1. Input Flow (Hospitality AI → SME OS)

**Step 1: User Input Collection**
- Hospitality AI collects user inputs through UI (forms, selections, file uploads)
- Inputs are in hospitality terminology (e.g., "room revenue", "occupancy rate", "staff shifts")

**Step 2: Adapter Translation**
- `packages/adapters/hospitality/` translates hospitality concepts to generic concepts
- Maps hospitality data structures to SME OS input contract shape
- Normalizes and validates data before sending to SME OS

**Step 3: SME OS Receives**
- SME OS receives normalized, generic input contract
- No hospitality terminology reaches SME OS internals
- Inputs are pure business metrics (cash flows, time periods, resource counts)

**Step 4: SME OS Processing**
- Domain models evaluate the scenario
- Engine components (evaluators, rules, scorers) process inputs
- Decision memory is consulted
- Alerts are generated if thresholds are crossed

### 2. Output Flow (SME OS → Hospitality AI)

**Step 1: SME OS Generates Output**
- SME OS produces output contract (alerts, confidence scores, explanations)
- Outputs are generic and contain no hospitality terminology

**Step 2: Adapter Translation**
- `packages/adapters/hospitality/` translates generic outputs back to hospitality concepts
- Maps generic explanations to hospitality-specific language
- Formats outputs for UI consumption

**Step 3: Hospitality AI Displays**
- UI components render translated outputs
- Alerts are displayed in hospitality context
- Explanations use hospitality terminology

## Key Principles

- **Unidirectional Translation**: Adapters translate in both directions, but SME OS never sees hospitality terminology
- **Contract Isolation**: SME OS only knows about contracts, not about adapters or UI
- **No Direct Communication**: Hospitality AI never bypasses adapters to communicate with SME OS
