# Engine

Decision evaluation and scoring engines.

## Responsibilities

- Evaluate scenarios using domain models
- Score decisions and recommendations
- Apply rules and constraints
- Generate explanations for decisions

## Boundaries

- **DO NOT** include vertical-specific evaluation logic
- **DO NOT** reference specific business contexts
- **DO** use generic evaluators and scorers
- **DO** provide abstract decision-making capabilities

## Components

- `evaluators/` - Scenario evaluation logic
- `rules/` - Business rules engine
- `scorers/` - Decision scoring algorithms
- `explainers/` - Decision explanation generation
