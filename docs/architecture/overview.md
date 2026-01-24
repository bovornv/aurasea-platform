# Architecture Overview

## System Architecture

```
┌─────────────────────────────────────────────────────────┐
│              Hospitality AI (Thin Shell)                │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐            │
│  │   UI     │  │ Services │  │ Adapters │            │
│  │  Pages   │  │  Layer   │  │  Layer   │            │
│  └──────────┘  └──────────┘  └──────────┘            │
│                          │                             │
│                          ▼                             │
│              ┌─────────────────────┐                   │
│              │  Adapter Translation │                   │
│              │  (Hospitality →     │                   │
│              │   Generic)          │                   │
│              └─────────────────────┘                   │
└───────────────────────────┬─────────────────────────────┘
                            │
                            │ Contracts
                            ▼
┌─────────────────────────────────────────────────────────┐
│              SME OS (Protected Core)                    │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐            │
│  │  Domain  │  │  Engine  │  │Contracts │            │
│  │  Models  │  │Evaluators │  │  API     │            │
│  └──────────┘  └──────────┘  └──────────┘            │
│       │              │                                  │
│       └──────┬───────┘                                  │
│              │                                          │
│       Decision Intelligence                            │
│       (Cash, Risk, Labor, Forecast)                    │
└─────────────────────────────────────────────────────────┘
```

## Data Flow Summary

### Input Flow
1. **User Input** → Hospitality AI collects hospitality-specific data
2. **Adapter Translation** → Converts hospitality terms to generic concepts
3. **Contract Input** → SME OS receives normalized, generic input
4. **Domain Processing** → SME OS evaluates using domain models
5. **Engine Evaluation** → Rules, evaluators, scorers process scenario

### Output Flow
1. **Engine Output** → SME OS generates generic outputs
2. **Contract Output** → Alerts, confidence, explanations in generic form
3. **Adapter Translation** → Converts generic outputs to hospitality concepts
4. **UI Display** → Hospitality AI renders translated outputs

## Key Architectural Principles

### Separation of Concerns
- **SME OS**: Pure decision intelligence, no UI, no vertical terminology
- **Hospitality AI**: Pure presentation and translation, no decision logic
- **Adapters**: Pure translation layer, bidirectional conversion

### Contract-Based Communication
- All communication happens through contracts
- Contracts are generic and stable
- No direct access to internal implementations

### Unidirectional Translation
- Hospitality → Generic (input direction)
- Generic → Hospitality (output direction)
- SME OS never sees hospitality terminology

### Protected Core
- SME OS is the protected brain
- No vertical-specific logic inside SME OS
- Vertical apps are thin shells

## Responsibility Matrix

| Concern | SME OS | Hospitality AI | Adapters |
|---------|--------|----------------|----------|
| Decision Logic | ✅ | ❌ | ❌ |
| UI Rendering | ❌ | ✅ | ❌ |
| Translation | ❌ | ❌ | ✅ |
| Data Collection | ❌ | ✅ | ❌ |
| Domain Models | ✅ | ❌ | ❌ |
| Business Rules | ✅ | ❌ | ❌ |
| Alerts Generation | ✅ | ❌ | ❌ |
| User Interaction | ❌ | ✅ | ❌ |

## Contract Stability

- Contracts are versioned and stable
- Breaking changes require explicit versioning
- Internal implementations can change without affecting contracts
- Adapters handle contract version compatibility

## Extension Points

### Adding New Verticals
1. Create new app in `apps/` (e.g., `apps/retail-ai/`)
2. Create adapters in `packages/adapters/` (e.g., `packages/adapters/retail/`)
3. Use same SME OS contracts
4. No changes to SME OS required

### Extending SME OS
1. Add new domain models in `core/sme-os/domain/`
2. Extend engine in `core/sme-os/engine/`
3. Update contracts if needed (with versioning)
4. Update adapters to handle new contract fields
