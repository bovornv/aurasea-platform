# Git Workflow

## Branch Strategy

### main
- **Purpose**: Stable, reviewable code
- **Protection**: Requires review before merge
- **Usage**: Production-ready code only
- **Merges from**: `develop` (via pull request)

### develop
- **Purpose**: Daily work and integration
- **Protection**: None (active development branch)
- **Usage**: Ongoing development, feature integration
- **Merges from**: `feature/*` branches

### feature/*
- **Purpose**: Short-lived experiments and features
- **Protection**: None
- **Usage**: Individual features, experiments, spikes
- **Naming**: `feature/description` (e.g., `feature/alert-display`, `feature/cash-domain`)
- **Lifecycle**: Create → Develop → Merge to `develop` → Delete

## Workflow

### Starting Work
1. Create feature branch from `develop`:
   ```bash
   git checkout develop
   git pull origin develop
   git checkout -b feature/my-feature
   ```

### Daily Work
1. Work on `develop` branch for regular development
2. Create `feature/*` branches for experiments or isolated work
3. Commit frequently with clear messages

### Completing Features
1. Merge feature branch to `develop`:
   ```bash
   git checkout develop
   git merge feature/my-feature
   git push origin develop
   git branch -d feature/my-feature
   ```

### Releasing to Production
1. Create pull request from `develop` to `main`
2. Review and approve
3. Merge to `main`
4. Tag release if needed

## Commit Messages

Follow conventional commits:
- `feat:` - New feature
- `fix:` - Bug fix
- `chore:` - Maintenance tasks
- `docs:` - Documentation
- `refactor:` - Code refactoring
- `test:` - Tests

Example: `feat: add cash flow domain model`

## Branch Protection

- `main`: Require pull request reviews before merging
- `develop`: No protection (active development)
- `feature/*`: No protection (experimental)
