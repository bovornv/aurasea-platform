# i18n Package

Internationalization package for Thai and English.

## Responsibilities

- Provide translation utilities
- Manage locale configuration
- Support Thai-first language priority
- Handle locale-specific formatting

## Boundaries

- **DO NOT** include vertical-specific translations
- **DO** prioritize Thai language
- **DO** provide English as optional fallback
- **DO** maintain consistent translation structure

## Structure

- `th/` - Thai translations
- `en/` - English translations
