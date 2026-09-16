// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { padHex, getTransparentColor, getVisibleTextColor, hslToHex, normalizeHexColor, pickPaletteColor, arraysShallowEqual, frameDelay } from './utils';
import { THEMES, CLASSIC_PALETTE, Theme, getTheme } from './themes';
import { ComboTracker } from './combo';

const COMBO_TIMEOUT_MS = 3000;
const MAX_ACTIVE_PARTICLES = 800;
const MAX_CHANGE_LENGTH = 1000;
const DEFAULT_COLOR = '#007acc';
const HIGH_SCORE_KEY = 'trailing-fun.highScore';
// Cap the backoff so a huge trail still animates perceptibly.
const MAX_FRAME_DELAY_MS = 250;
// Coalesce rapid status bar updates during a typing burst.
const STATUS_BAR_THROTTLE_MS = 120;
// Set TRAILING_FUN_DEBUG=1 to log frame / setDecorations throughput.
const DEBUG = !!process.env.TRAILING_FUN_DEBUG;

class SimpleParticle {
    public count: number = 0;

    constructor(
        public editor: vscode.TextEditor,
        public range: vscode.Range,
        public color: string,
        public effect: string,
        public maxSteps: number
    ) {
        activeParticles.add(this);
    }

    public update(): boolean {
        this.count++;
        return this.count < this.maxSteps;
    }
}

const decorationCache = new Map<string, vscode.TextEditorDecorationType>();
// Ranges applied last frame per editor/decoration type, so we can skip redundant API calls
const appliedDecorations = new Map<vscode.TextEditor, Map<vscode.TextEditorDecorationType, readonly vscode.Range[]>>();
// Decorations already used in the frame currently being rendered, so eviction can't dispose them
const currentFrameDecorations = new Set<vscode.TextEditorDecorationType>();
// Palette-based colors bound the number of unique decoration types, so this cap is rarely hit.
const MAX_CACHE_SIZE = 1024;

function applyDecorations(
    editor: vscode.TextEditor,
    decoration: vscode.TextEditorDecorationType,
    ranges: readonly vscode.Range[]
) {
    editor.setDecorations(decoration, ranges);
    if (DEBUG) {
        debugSetDecorations++;
    }
}

let debugFrames = 0;
let debugSetDecorations = 0;
let debugWindowStart = 0;

function debugTick() {
    if (!DEBUG) {
        return;
    }
    debugFrames++;
    const now = Date.now();
    if (!debugWindowStart) {
        debugWindowStart = now;
    }
    if (now - debugWindowStart >= 2000) {
        const seconds = (now - debugWindowStart) / 1000;
        console.log(`[trailing-fun] ${(debugFrames / seconds).toFixed(1)} frames/s, ${(debugSetDecorations / seconds).toFixed(1)} setDecorations/s, ${activeParticles.size} active`);
        debugFrames = 0;
        debugSetDecorations = 0;
        debugWindowStart = now;
    }
}

function getCachedDecoration(particle: SimpleParticle, alpha: number): vscode.TextEditorDecorationType {
    // Bucket alpha to nearest 10 to reduce unique decoration types (approx 20 steps for smoother fading)
    const alphaBucket = Math.round(alpha / 10) * 10;

    // For glitch, we want some jitter, so we include a small jitter index in the key
    const jitterIndex = particle.effect === 'glitch' ? (particle.count % 3) : 0;

    const key = `${particle.effect}-${particle.color}-${alphaBucket}-${jitterIndex}`;

    let decoration = decorationCache.get(key);
    if (!decoration) {
        if (decorationCache.size >= MAX_CACHE_SIZE) {
            evictUnusedCacheEntries();
        }
        decoration = createDecorationType(particle, alphaBucket, jitterIndex);
        decorationCache.set(key, decoration);
    }
    return decoration;
}

function evictUnusedCacheEntries() {
    // Collect all decorations currently in use (last frame + the frame being built)
    const inUse = new Set<vscode.TextEditorDecorationType>(currentFrameDecorations);
    for (const rangesByType of appliedDecorations.values()) {
        for (const d of rangesByType.keys()) { inUse.add(d); }
    }
    // Dispose and remove only those NOT in use
    for (const [key, decoration] of decorationCache.entries()) {
        if (!inUse.has(decoration)) {
            decoration.dispose();
            decorationCache.delete(key);
        }
    }
}

function createDecorationType(particle: SimpleParticle, alpha: number, jitterIndex: number = 0): vscode.TextEditorDecorationType {
    const bgColor = getTransparentColor(particle.color, alpha);
    const textColor = getVisibleTextColor(particle.color);
    const alphaHex = padHex(alpha + 55);

    const renderOptions: vscode.DecorationRenderOptions = {
        backgroundColor: bgColor,
        color: textColor + alphaHex,
        rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed
    };

    switch (particle.effect) {
        case 'glow':
            renderOptions.fontWeight = 'bold';
            renderOptions.textDecoration = `none; text-shadow: 0 0 10px ${particle.color}, 0 0 20px ${particle.color}`;
            break;
        case 'matrix':
            renderOptions.backgroundColor = '#003300' + padHex(Math.floor(alpha * 0.5));
            renderOptions.color = '#00ff00' + alphaHex;
            renderOptions.textDecoration = `none; text-shadow: 0 0 5px #00ff00`;
            break;
        case 'glitch': {
            const offset = (jitterIndex * 2 - 2).toFixed(1);
            const offset2 = ((2 - jitterIndex) * 2 - 2).toFixed(1);
            renderOptions.textDecoration = `none; text-shadow: ${offset}px 0 0 rgba(0, 255, 255, ${alpha / 255}), ${offset2}px 0 0 rgba(255, 0, 255, ${alpha / 255})`;
            renderOptions.color = '#ffffff' + alphaHex;
            break;
        }
        case 'fire':
            renderOptions.color = '#fffbd6' + alphaHex;
            renderOptions.textDecoration = `none; text-shadow: 0 -1px 3px #ffb400, 0 -2px 6px #ff5a00, 0 -4px 12px #ff0000`;
            renderOptions.fontWeight = 'bold';
            break;
        case 'neon':
            renderOptions.color = '#ffffff' + padHex(Math.min(255, alpha + 150));
            renderOptions.textDecoration = `none; text-shadow: 0 0 2px #fff, 0 0 5px #fff, 0 0 10px #ff00ff, 0 0 20px #ff00ff, 0 0 30px #00ffff, 0 0 45px #00ffff, 0 0 70px #00ffff`;
            renderOptions.fontWeight = 'bold';
            break;
        case 'aurora':
            renderOptions.color = '#eafff9' + alphaHex;
            renderOptions.textDecoration = `none; text-shadow: 0 0 6px ${particle.color}, 0 0 14px #00e5ff, 0 0 24px #b388ff`;
            renderOptions.fontWeight = 'bold';
            break;
        case 'vaporwave': {
            const a = alpha / 255;
            renderOptions.color = '#ffffff' + alphaHex;
            renderOptions.textDecoration = `none; text-shadow: 2px 0 0 rgba(255, 45, 149, ${a}), -2px 0 0 rgba(1, 205, 254, ${a}), 0 0 8px #ff00ff`;
            renderOptions.fontStyle = 'italic';
            break;
        }
        case 'hyperdrive':
            renderOptions.color = '#eaf6ff' + alphaHex;
            renderOptions.textDecoration = `none; text-shadow: -2px 0 3px #4fa3ff, -5px 0 8px #2f6bff, 0 0 6px #ffffff`;
            renderOptions.fontWeight = 'bold';
            break;
    }

    return vscode.window.createTextEditorDecorationType(renderOptions);
}

let isEnabled = true;
let hue = 0;
let myStatusBarItem: vscode.StatusBarItem;
const activeParticles = new Set<SimpleParticle>();
let animationTimer: NodeJS.Timeout | undefined;
let lastActiveParticleCount = 0;
let smartSaveTimer: NodeJS.Timeout | undefined;
let comboResetTimer: NodeJS.Timeout | undefined;
let statusBarTimer: NodeJS.Timeout | undefined;
const pendingSaves = new Set<vscode.TextDocument>();

let currentTheme: Theme = THEMES[0];
let currentFixedColor = DEFAULT_COLOR;
let currentTrailLength = 12;
let currentTrailSpeed = 50;
let smartAutoSaveEnabled = true;

let comboTracker = new ComboTracker(COMBO_TIMEOUT_MS, 0);

let originalAutoSave: string | undefined;
let autoSaveDisabledByUs = false;
let extensionContext: vscode.ExtensionContext | undefined;

/**
 * Smart Auto-Save only disables `files.autoSave` for the duration of a typing
 * burst (restored once the trail finishes), so a crash never leaves the user
 * without auto-save for the whole session.
 */
async function disableAutoSaveForBurst() {
    if (!extensionContext || autoSaveDisabledByUs) {
        return;
    }
    const config = vscode.workspace.getConfiguration('files');
    const currentAutoSave = config.get<string>('autoSave');
    if (currentAutoSave && currentAutoSave !== 'off') {
        autoSaveDisabledByUs = true;
        originalAutoSave = currentAutoSave;
        // Persist so we can recover if VS Code exits mid-burst
        await extensionContext.globalState.update('originalAutoSave', originalAutoSave);
        await config.update('autoSave', 'off', vscode.ConfigurationTarget.Global);
    }
}

async function restoreAutoSave() {
    if (smartSaveTimer) {
        clearTimeout(smartSaveTimer);
        smartSaveTimer = undefined;
    }
    flushPendingSaves();
    if (!extensionContext) {
        return;
    }
    const toRestore = originalAutoSave ?? extensionContext.globalState.get<string>('originalAutoSave');
    if (toRestore && toRestore !== 'off') {
        await vscode.workspace.getConfiguration('files').update('autoSave', toRestore, vscode.ConfigurationTarget.Global);
    }
    originalAutoSave = undefined;
    autoSaveDisabledByUs = false;
    await extensionContext.globalState.update('originalAutoSave', undefined);
}

function isSaveable(doc: vscode.TextDocument): boolean {
    return doc.isDirty && !doc.isUntitled && doc.uri.scheme === 'file';
}

function flushPendingSaves() {
    for (const doc of pendingSaves) {
        try {
            if (isSaveable(doc)) {
                doc.save();
            }
        } catch {
            // Document may have been closed/disposed before the timer fired
        }
    }
    pendingSaves.clear();
}

function scheduleSmartSave(doc: vscode.TextDocument) {
    if (!smartAutoSaveEnabled) {
        return;
    }

    void disableAutoSaveForBurst();
    pendingSaves.add(doc);
    if (smartSaveTimer) {
        clearTimeout(smartSaveTimer);
    }

    const delay = currentTrailLength * currentTrailSpeed + 500;
    smartSaveTimer = setTimeout(() => {
        smartSaveTimer = undefined;
        void restoreAutoSave();
    }, delay);
}

let comboLastHit = 0;

/**
 * One self-correcting timer per idle cycle instead of a new timeout on every
 * keystroke: it re-arms itself only while the user is still typing.
 */
function scheduleComboReset() {
    if (comboResetTimer) {
        return;
    }
    comboResetTimer = setTimeout(function tick() {
        const idleFor = Date.now() - comboLastHit;
        if (idleFor < COMBO_TIMEOUT_MS) {
            comboResetTimer = setTimeout(tick, COMBO_TIMEOUT_MS - idleFor);
            return;
        }
        comboResetTimer = undefined;
        comboTracker.reset();
        updateStatusBar();
    }, COMBO_TIMEOUT_MS);
}

function updateConfig() {
    const config = vscode.workspace.getConfiguration('trailing-fun');
    currentTheme = getTheme(config.get<string>('theme', 'classic'));
    currentFixedColor = normalizeHexColor(config.get<string>('fixedColor'), DEFAULT_COLOR);
    currentTrailLength = config.get<number>('trailLength', 12);
    currentTrailSpeed = config.get<number>('trailSpeed', 50);
    smartAutoSaveEnabled = config.get<boolean>('smartAutoSave', true);
}

function nextColor(): string {
    if (currentTheme.mode === 'rainbow') {
        hue = (hue + 10) % 360;
        return hslToHex(hue, 80, 50);
    }
    if (currentTheme.mode === 'fixed') {
        return currentFixedColor;
    }
    return pickPaletteColor(currentTheme.palette ?? CLASSIC_PALETTE);
}

export function activate(context: vscode.ExtensionContext) {
    console.log('Trailing Fun extension is now active!');
    extensionContext = context;
    comboTracker = new ComboTracker(COMBO_TIMEOUT_MS, context.globalState.get<number>(HIGH_SCORE_KEY) ?? 0);
    updateConfig();

    // Recover auto-save if VS Code was closed mid-burst previously
    originalAutoSave = context.globalState.get<string>('originalAutoSave');
    if (originalAutoSave) {
        void restoreAutoSave();
    }

    context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(e => {
        if (!e.affectsConfiguration('trailing-fun')) {
            return;
        }
        const oldSpeed = currentTrailSpeed;
        const wasSmart = smartAutoSaveEnabled;
        updateConfig();
        // Only clear cache when idle to avoid visual gaps mid-animation
        if (activeParticles.size === 0) {
            clearDecorationCache();
        }

        // If speed changed, restart the loop to apply it
        if (currentTrailSpeed !== oldSpeed) {
            stopAnimationLoop();
            startAnimationLoop();
        }

        if (wasSmart && !smartAutoSaveEnabled) {
            void restoreAutoSave();
        }
    }));

    // Drop bookkeeping for closed documents so we don't hold or save them
    context.subscriptions.push(vscode.workspace.onDidCloseTextDocument(doc => {
        pendingSaves.delete(doc);
        for (const editor of appliedDecorations.keys()) {
            if (editor.document === doc) {
                appliedDecorations.delete(editor);
            }
        }
    }));

    // Animation loop starts on-demand from the first keypress (see onDidChangeTextDocument).

    // Initialize Status Bar Item
    myStatusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    myStatusBarItem.command = 'trailing-fun.showQuickMenu';
    myStatusBarItem.tooltip = "Click to configure Trailing Fun";
    updateStatusBar();
    myStatusBarItem.show();
    context.subscriptions.push(myStatusBarItem);

    const disposableToggle = vscode.commands.registerCommand('trailing-fun.toggle', () => {
        isEnabled = !isEnabled;
        if (!isEnabled) {
            clearActiveTrail();
            comboTracker.reset();
            if (comboResetTimer) {
                clearTimeout(comboResetTimer);
                comboResetTimer = undefined;
            }
            void restoreAutoSave();
        }
        vscode.window.showInformationMessage(`Trailing Fun trail is now ${isEnabled ? 'enabled' : 'disabled'}.`);
        updateStatusBar();
    });

    const disposableQuickMenu = vscode.commands.registerCommand('trailing-fun.showQuickMenu', async () => {
        const options: vscode.QuickPickItem[] = [
            {
                label: isEnabled ? "$(debug-pause) Disable Trail" : "$(play) Enable Trail",
                description: isEnabled ? "⏸️ Pause the magic" : "▶️ Start the fun!",
                detail: isEnabled ? "Temporarily stop the trail effect" : "Activate the colorful trail"
            },
            {
                label: "$(paintcan) Effects & Themes",
                description: `🎨 Current: ${currentTheme.id}`,
                detail: "Choose a visual style for your trail"
            },
            {
                label: "$(line-height) Trail Length",
                description: `📏 Current: ${currentTrailLength} steps`,
                detail: "Adjust how long the trail follows you"
            },
            {
                label: "$(dashboard) Trail Speed",
                description: `🚀 Current: ${currentTrailSpeed}ms`,
                detail: "Change the delay between fade steps"
            },
            {
                label: "$(trophy) High Score",
                description: `🏆 Best combo: ${comboTracker.highScore}`,
                detail: "Reset your combo high score"
            },
            {
                label: "$(refresh) Reset to Defaults",
                description: "Restore all settings to factory magic",
                detail: "Resets theme, color, length, and speed to their original values"
            }
        ];

        const selection = await vscode.window.showQuickPick(options, {
            placeHolder: '✨ Trailing Fun Configuration ✨',
            matchOnDescription: true,
            matchOnDetail: true
        });

        if (selection) {
            if (selection.label.includes('Disable') || selection.label.includes('Enable')) {
                vscode.commands.executeCommand('trailing-fun.toggle');
            } else if (selection.label.includes('Effects & Themes')) {
                const themes: (vscode.QuickPickItem & { id: string })[] = THEMES.map(t => ({
                    label: t.label,
                    id: t.id,
                    detail: t.description
                }));

                const themeSelection = await vscode.window.showQuickPick(themes, {
                    placeHolder: 'Select a Theme',
                    matchOnDetail: true
                });

                if (themeSelection) {
                    const config = vscode.workspace.getConfiguration('trailing-fun');
                    await config.update('theme', themeSelection.id, vscode.ConfigurationTarget.Global);

                    if (themeSelection.id === 'fixed') {
                        const color = await vscode.window.showInputBox({
                            placeHolder: '#007acc',
                            prompt: '📍 Pick your fixed color (Hex format: #RRGGBB)',
                            value: currentFixedColor
                        });
                        if (color && /^#[0-9A-Fa-f]{6}$/.test(color)) {
                            await config.update('fixedColor', color, vscode.ConfigurationTarget.Global);
                            vscode.window.showInformationMessage(`Theme set to ${themeSelection.label} (${color})`);
                        } else if (color) {
                            vscode.window.showErrorMessage('Invalid hex color format. Please use #RRGGBB');
                        }
                    } else {
                        vscode.window.showInformationMessage(`Theme set to ${themeSelection.label}`);
                    }
                }
            } else if (selection.label.includes('Trail Length')) {
                const length = await vscode.window.showInputBox({
                    placeHolder: '8',
                    prompt: '📏 Enter trail length (1-50)',
                    value: currentTrailLength.toString()
                });
                if (length) {
                    const val = parseInt(length);
                    if (!isNaN(val) && val >= 1 && val <= 50) {
                        await vscode.workspace.getConfiguration('trailing-fun').update('trailLength', val, vscode.ConfigurationTarget.Global);
                    } else {
                        vscode.window.showErrorMessage('Trail length must be between 1 and 50.');
                    }
                }
            } else if (selection.label.includes('Trail Speed')) {
                const speed = await vscode.window.showInputBox({
                    placeHolder: '60',
                    prompt: '🚀 Enter step delay in ms (10-500)',
                    value: currentTrailSpeed.toString()
                });
                if (speed) {
                    const val = parseInt(speed);
                    if (!isNaN(val) && val >= 10 && val <= 500) {
                        await vscode.workspace.getConfiguration('trailing-fun').update('trailSpeed', val, vscode.ConfigurationTarget.Global);
                    } else {
                        vscode.window.showErrorMessage('Trail speed must be between 10 and 500 ms.');
                    }
                }
            } else if (selection.label.includes('High Score')) {
                await context.globalState.update(HIGH_SCORE_KEY, 0);
                comboTracker = new ComboTracker(COMBO_TIMEOUT_MS, 0);
                updateStatusBar();
                vscode.window.showInformationMessage('Combo high score reset ✨');
            } else if (selection.label.includes('Reset to Defaults')) {
                const config = vscode.workspace.getConfiguration('trailing-fun');
                await config.update('theme', undefined, vscode.ConfigurationTarget.Global);
                await config.update('fixedColor', undefined, vscode.ConfigurationTarget.Global);
                await config.update('trailLength', undefined, vscode.ConfigurationTarget.Global);
                await config.update('trailSpeed', undefined, vscode.ConfigurationTarget.Global);
                await config.update('smartAutoSave', undefined, vscode.ConfigurationTarget.Global);
                vscode.window.showInformationMessage('Trailing Fun settings reset to defaults ✨');
            }
        }
    });

    const onDidChangeDisposable = vscode.workspace.onDidChangeTextDocument(event => {
        if (!isEnabled) {
            return;
        }

        const activeEditor = vscode.window.activeTextEditor;
        if (!activeEditor || activeEditor.document !== event.document) {
            return;
        }

        // Count only actual insertions toward the combo
        if (event.contentChanges.some(change => change.text.length > 0)) {
            comboLastHit = Date.now();
            const { isRecord } = comboTracker.hit(comboLastHit);
            if (isRecord) {
                void context.globalState.update(HIGH_SCORE_KEY, comboTracker.highScore);
            }
            scheduleComboReset();
            scheduleStatusBarUpdate();
        }

        // Always schedule a smart save on any keypress (including backspace, enter, etc.)
        scheduleSmartSave(event.document);

        event.contentChanges.forEach(change => {
            // Ignore very large changes (like massive pastes) to avoid performance issues.
            // Increased to 1000 to support most autocompletes while still protecting against huge blocks.
            if (change.text.length === 0 || change.text.length > MAX_CHANGE_LENGTH) {
                return;
            }

            const color = nextColor();
            const start = change.range.start;
            const lines = change.text.split('\n');

            // Create a separate particle per line to avoid multi-line decoration flicker
            lines.forEach((lineText, index) => {
                if (lineText.trim().length === 0 && lines.length > 1) { return; }
                if (activeParticles.size >= MAX_ACTIVE_PARTICLES) { return; }
                const line = start.line + index;
                const charStart = index === 0 ? start.character : 0;
                const charEnd = index === 0 && lines.length === 1
                    ? start.character + lineText.length
                    : lineText.length;
                const effectRange = new vscode.Range(line, charStart, line, charEnd);
                new SimpleParticle(activeEditor, effectRange, color, currentTheme.effect, currentTrailLength);
            });
            // Ensure the animation loop is running (it stops itself when idle)
            startAnimationLoop();
        });
    });

    context.subscriptions.push(disposableToggle);
    context.subscriptions.push(disposableQuickMenu);
    context.subscriptions.push(onDidChangeDisposable);
}

export async function deactivate() {
    clearActiveTrail();
    clearDecorationCache();
    activeParticles.clear();
    // Always restore auto-save on deactivate/uninstall
    await restoreAutoSave();
}

function clearPreviousFrame() {
    for (const [editor, rangesByType] of appliedDecorations) {
        for (const decoration of rangesByType.keys()) {
            applyDecorations(editor, decoration, []);
        }
    }
    appliedDecorations.clear();
}

function clearActiveTrail() {
    activeParticles.clear();
    lastActiveParticleCount = 0;
    stopAnimationLoop();
    clearPreviousFrame();
}

/**
 * Back off the frame rate as the trail grows so per-frame work stays bounded.
 * At typical settings this returns `currentTrailSpeed` unchanged.
 */
function effectiveFrameDelay(): number {
    return frameDelay(activeParticles.size, currentTrailSpeed, MAX_FRAME_DELAY_MS);
}

function startAnimationLoop() {
    if (animationTimer) {
        return;
    }
    scheduleFrame();
}

function scheduleFrame() {
    animationTimer = setTimeout(() => {
        animationTimer = undefined;
        renderFrame();
    }, effectiveFrameDelay());
}

function renderFrame() {
    debugTick();

    if (activeParticles.size === 0) {
        if (lastActiveParticleCount > 0) {
            // One final clear of all decorations when the trail ends
            clearPreviousFrame();
            lastActiveParticleCount = 0;
        }
        // Fully idle: stop the loop so it uses no CPU
        stopAnimationLoop();
        return;
    }
    lastActiveParticleCount = activeParticles.size;
    currentFrameDecorations.clear();

    // Group particles by editor
    const editorMap = new Map<vscode.TextEditor, SimpleParticle[]>();
    for (const particle of activeParticles) {
        if (!particle.update()) {
            activeParticles.delete(particle);
            continue;
        }
        const list = editorMap.get(particle.editor) || [];
        list.push(particle);
        editorMap.set(particle.editor, list);
    }

    const visibleEditors = new Set(vscode.window.visibleTextEditors);

    // For each editor, apply diff-based decoration updates (only touch what changed)
    for (const [editor, particles] of editorMap) {
        // Skip editors that have been closed or hidden since the particle was created
        if (!visibleEditors.has(editor)) {
            for (const p of particles) { activeParticles.delete(p); }
            // Clear the frozen trail so it doesn't reappear stale when reopened
            const staleDecorations = appliedDecorations.get(editor);
            if (staleDecorations) {
                for (const decoration of staleDecorations.keys()) {
                    applyDecorations(editor, decoration, []);
                }
            }
            appliedDecorations.delete(editor);
            continue;
        }

        const decorationGroups = new Map<vscode.TextEditorDecorationType, vscode.Range[]>();

        for (const particle of particles) {
            const alpha = Math.floor(200 * (1 - (particle.count / particle.maxSteps)));
            const decoration = getCachedDecoration(particle, alpha);
            currentFrameDecorations.add(decoration);
            const ranges = decorationGroups.get(decoration) || [];
            ranges.push(particle.range);
            decorationGroups.set(decoration, ranges);
        }

        const applied = appliedDecorations.get(editor);

        // Clear decorations that were active last frame but aren't this frame
        if (applied) {
            for (const decoration of applied.keys()) {
                if (!decorationGroups.has(decoration)) {
                    applyDecorations(editor, decoration, []);
                }
            }
        }

        // Apply only the groups whose ranges actually changed
        for (const [decoration, ranges] of decorationGroups) {
            if (!arraysShallowEqual(applied?.get(decoration), ranges)) {
                applyDecorations(editor, decoration, ranges);
            }
        }

        appliedDecorations.set(editor, decorationGroups);
    }

    scheduleFrame();
}

function stopAnimationLoop() {
    if (animationTimer) {
        clearTimeout(animationTimer);
        animationTimer = undefined;
    }
}

function clearDecorationCache() {
    // Remove any decorations still applied before disposing their types
    clearPreviousFrame();
    currentFrameDecorations.clear();
    for (const decoration of decorationCache.values()) {
        decoration.dispose();
    }
    decorationCache.clear();
}

let lastStatusText = '';
let lastStatusTooltip = '';

function updateStatusBar() {
    let text: string;
    let tooltip: string;

    if (!isEnabled) {
        text = `$(sparkle) Trailing Fun (Off)`;
        tooltip = `Click to configure Trailing Fun`;
    } else {
        const combo = comboTracker.current;
        if (combo >= 2) {
            const isRecord = comboTracker.highScore > 0 && combo >= comboTracker.highScore;
            text = `${isRecord ? '$(trophy)' : '$(flame)'} ${combo}`;
            tooltip = `Combo ${combo} • Best ${comboTracker.highScore}\nClick to configure Trailing Fun`;
        } else {
            text = `$(sparkle) Fun`;
            tooltip = `Best combo ${comboTracker.highScore} • Click to configure Trailing Fun`;
        }
    }

    if (text === lastStatusText && tooltip === lastStatusTooltip) {
        return;
    }
    lastStatusText = text;
    lastStatusTooltip = tooltip;
    myStatusBarItem.text = text;
    myStatusBarItem.tooltip = tooltip;
}

/**
 * Throttles status bar updates during a burst so we don't touch the UI on every keystroke.
 */
function scheduleStatusBarUpdate() {
    if (statusBarTimer) {
        return;
    }
    statusBarTimer = setTimeout(() => {
        statusBarTimer = undefined;
        updateStatusBar();
    }, STATUS_BAR_THROTTLE_MS);
}
