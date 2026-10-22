# Changelog

All notable changes to Trailing Fun will be documented in this file.

## [2.0.0] - 2026-10-22

### Breaking Changes
- Retired Smart Auto-Save interception in favor of VS Code's native auto-save settings. The legacy setting is deprecated, defaults to false, and no longer saves files or changes preferences during editing. To enable delayed saving, set `files.autoSave` to `afterDelay` and configure `files.autoSaveDelay`.

### Fixed
- Correct first-line highlighting for multiline insertions at nonzero columns.
- Render one-step trails instead of expiring them before their first frame.
- Clear stale trails when edits shift their positions, during undo/redo, and when a document closes.
- Clear an editor's expired decorations even while another editor is still animating.
- Remember the enabled/disabled preference across reloads and cancel all timers on deactivation.

### Changed
- Recover an older version's saved auto-save preference once, only if the global setting is still off.
- Corrected idle-performance and save-behavior documentation.

## [1.1.0] - 2026-09-16

### Added
- **Gamified combo system** — consecutive keystrokes build a combo shown in the status bar, with a persistent high score (reset from the Quick Config menu).
- **3 new themes**: Aurora, Vaporwave, and Hyperdrive (11 total).
- Single theme registry so future effects only need one definition.
- Unit + integration test coverage for utilities, combo tracking, and theme/manifest parity.

### Changed
- **Performance**: palette-based colors replace fully random RGB, so the decoration cache stays effective and far fewer decoration types are created.
- **Performance**: redundant `setDecorations` calls are now skipped when a frame's ranges are unchanged, the frame rate backs off under heavy particle load, and status bar updates are throttled during a burst. Set `TRAILING_FUN_DEBUG=1` to log frames/s and `setDecorations`/s.
- **Smart Auto-Save** now only disables `files.autoSave` for the duration of a typing burst and restores it afterwards (with crash recovery), instead of leaving it off for the whole session.
- Upgraded `@vscode/test-electron` for compatibility with current VS Code builds.

### Fixed
- Smart save could save the wrong document when switching editors mid-burst.
- Pending saves were dropped when disabling the extension or deactivating.
- Frozen trail decorations could reappear after switching away from a tab mid-animation.
- Decoration cache eviction could dispose decoration types still in use.
- Disabling the trail left particles fading instead of clearing immediately.
- Animation loop could keep running while idle after a speed change.
- Invalid `trailing-fun.fixedColor` values now fall back to a safe default.
- Closed documents are no longer held for saving.

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
