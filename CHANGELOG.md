# Changelog

All notable changes to Trailing Fun will be documented in this file.

## [1.0.0] - 2026-04-25

### Added
- 8 visual themes: Classic, Rainbow, Fixed Color, Glow, Neon Cyberpunk, Burning Fire, Digital Glitch, Matrix Rain
- Gamified combo system with persistent high-score tracking
- Smart Auto-Save (opt-in): disables `files.autoSave` during typing, saves once when trail finishes
- Interactive Quick Config menu via status bar
- Configurable trail length and fade delay
- Event-driven animation engine with zero idle overhead
- Autocomplete-aware particle system (supports up to 1000 characters)
- Per-line particle splitting for flicker-free multi-line effects
- Diff-based decoration rendering for minimal API calls
- Decoration cache with smart eviction (capped at 150 entries)