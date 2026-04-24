// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { padHex, getTransparentColor, getVisibleTextColor, hslToHex, getRandomColor } from './utils';

class SimpleParticle {
    public count: number = 0;

    constructor(
        public editor: vscode.TextEditor,
        public range: vscode.Range,
        public color: string,
        public funnyMode: string,
        public shouldTriggerFunny: boolean,
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
// Track which decorations were applied last frame per editor, for diff-based clearing
const previousFrameDecorations = new Map<vscode.TextEditor, Set<vscode.TextEditorDecorationType>>();
const MAX_CACHE_SIZE = 150;

function getCachedDecoration(particle: SimpleParticle, alpha: number): vscode.TextEditorDecorationType {
    // Bucket alpha to nearest 10 to reduce unique decoration types (approx 20 steps for smoother fading)
    const alphaBucket = Math.round(alpha / 10) * 10;

    // For glitch, we want some jitter, so we include a small jitter index in the key
    const jitterIndex = particle.funnyMode === 'glitch' ? (particle.count % 3) : 0;

    const key = `${particle.funnyMode}-${particle.color}-${alphaBucket}-${particle.shouldTriggerFunny}-${jitterIndex}`;

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
    // Collect all decorations currently in use
    const inUse = new Set<vscode.TextEditorDecorationType>();
    for (const decoSet of previousFrameDecorations.values()) {
        for (const d of decoSet) { inUse.add(d); }
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

    let renderOptions: vscode.DecorationRenderOptions = {
        backgroundColor: bgColor,
        color: textColor + alphaHex,
        rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed
    };

    if (particle.shouldTriggerFunny) {
        const mode = particle.funnyMode;

        if (mode === 'glow') {
            renderOptions.fontWeight = 'bold';
            renderOptions.textDecoration = `none; text-shadow: 0 0 10px ${particle.color}, 0 0 20px ${particle.color}`;
        } else if (mode === 'matrix') {
            renderOptions.backgroundColor = '#003300' + padHex(Math.floor(alpha * 0.5));
            renderOptions.color = '#00ff00' + alphaHex;
            renderOptions.textDecoration = `none; text-shadow: 0 0 5px #00ff00`;
        } else if (mode === 'glitch') {
            // Use jitterIndex to create deterministic offsets for the cache
            const offset = (jitterIndex * 2 - 2).toFixed(1);
            const offset2 = ((2 - jitterIndex) * 2 - 2).toFixed(1);
            renderOptions.textDecoration = `none; text-shadow: ${offset}px 0 0 rgba(0, 255, 255, ${alpha / 255}), ${offset2}px 0 0 rgba(255, 0, 255, ${alpha / 255})`;
            renderOptions.color = '#ffffff' + alphaHex;
        } else if (mode === 'fire') {
            renderOptions.color = '#fffbd6' + alphaHex;
            renderOptions.textDecoration = `none; text-shadow: 0 -1px 3px #ffb400, 0 -2px 6px #ff5a00, 0 -4px 12px #ff0000`;
            renderOptions.fontWeight = 'bold';
        } else if (mode === 'neon') {
            // Remove Date.now() to make it cache-friendly, use alpha or fixed vibrant colors
            const color1 = '#ff00ff';
            const color2 = '#00ffff';
            renderOptions.color = '#ffffff' + padHex(Math.min(255, alpha + 150));
            renderOptions.textDecoration = `none; text-shadow: 0 0 2px #fff, 0 0 5px #fff, 0 0 10px ${color1}, 0 0 20px ${color1}, 0 0 30px ${color2}, 0 0 45px ${color2}, 0 0 70px ${color2}`;
            renderOptions.fontWeight = 'bold';
        }
    }

    return vscode.window.createTextEditorDecorationType(renderOptions);
}


const CONTINUOUS_MODES = ['glow', 'matrix', 'glitch', 'fire', 'neon'];

let isEnabled = true;
let hue = 0;
let funnyTriggerCounter = 0;
let myStatusBarItem: vscode.StatusBarItem;
const activeParticles = new Set<SimpleParticle>();
let animationTimer: NodeJS.Timeout | undefined;
let lastActiveParticleCount = 0;
let smartSaveTimer: NodeJS.Timeout | undefined;

let currentTheme = 'classic';
let currentMode = 'random';
let currentFixedColor = '#007acc';
let currentFunnyMode = 'none';
let currentTrailLength = 12;
let currentTrailSpeed = 50;
let smartAutoSaveEnabled = false;

let originalAutoSave: string | undefined;
let extensionContext: vscode.ExtensionContext | undefined;

async function manageAutoSave() {
    if (!extensionContext || !smartAutoSaveEnabled) {
        // If smart auto-save was just disabled, restore original setting
        if (!smartAutoSaveEnabled && originalAutoSave) {
            await restoreAutoSave();
        }
        return;
    }
    const config = vscode.workspace.getConfiguration('files');
    if (isEnabled) {
        const currentAutoSave = config.get<string>('autoSave');
        if (currentAutoSave && currentAutoSave !== 'off') {
            originalAutoSave = currentAutoSave;
            // Persist across restarts
            extensionContext.globalState.update('originalAutoSave', originalAutoSave);
            await config.update('autoSave', 'off', vscode.ConfigurationTarget.Global);
        }
    } else {
        await restoreAutoSave();
    }
}

async function restoreAutoSave() {
    if (!extensionContext) { return; }
    if (smartSaveTimer) {
        clearTimeout(smartSaveTimer);
        smartSaveTimer = undefined;
    }
    const config = vscode.workspace.getConfiguration('files');
    const toRestore = originalAutoSave ?? extensionContext.globalState.get<string>('originalAutoSave');
    if (toRestore && toRestore !== 'off') {
        await config.update('autoSave', toRestore, vscode.ConfigurationTarget.Global);
    }
    originalAutoSave = undefined;
    extensionContext.globalState.update('originalAutoSave', undefined);
}

function scheduleSmartSave() {
    if (!smartAutoSaveEnabled) return;
    
    if (smartSaveTimer) {
        clearTimeout(smartSaveTimer);
    }
    
    const delay = currentTrailLength * currentTrailSpeed + 500;
    smartSaveTimer = setTimeout(() => {
        const doc = vscode.window.activeTextEditor?.document;
        if (doc && doc.isDirty && !doc.isUntitled && doc.uri.scheme === 'file') {
            doc.save();
        }
        smartSaveTimer = undefined;
    }, delay);
}

function updateConfig() {
    const config = vscode.workspace.getConfiguration('trailing-fun');
    currentTheme = config.get<string>('theme', 'classic');
    currentFixedColor = config.get<string>('fixedColor', '#007acc');
    currentTrailLength = config.get<number>('trailLength', 12);
    currentTrailSpeed = config.get<number>('trailSpeed', 50);
    smartAutoSaveEnabled = config.get<boolean>('smartAutoSave', false);

    // Derive mode and funnyMode from theme
    const themeMap: Record<string, { mode: string, funny: string }> = {
        'classic': { mode: 'random', funny: 'none' },
        'rainbow': { mode: 'rainbow', funny: 'none' },
        'fixed': { mode: 'fixed', funny: 'none' },
        'glow': { mode: 'random', funny: 'glow' },
        'neon': { mode: 'fixed', funny: 'neon' },
        'fire': { mode: 'fixed', funny: 'fire' },
        'glitch': { mode: 'random', funny: 'glitch' },
        'matrix': { mode: 'fixed', funny: 'matrix' }
    };

    const mapping = themeMap[currentTheme] || themeMap['classic'];
    currentMode = mapping.mode;
    currentFunnyMode = mapping.funny;
}

export function activate(context: vscode.ExtensionContext) {
    console.log('Trailing Fun extension is now active!');
    extensionContext = context;
    updateConfig();
    // Recover persisted originalAutoSave if VS Code was restarted mid-session
    originalAutoSave = context.globalState.get<string>('originalAutoSave');
    manageAutoSave();

    context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(e => {
        if (e.affectsConfiguration('trailing-fun')) {
            const oldSpeed = currentTrailSpeed;
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

    let disposableToggle = vscode.commands.registerCommand('trailing-fun.toggle', () => {
        isEnabled = !isEnabled;
        vscode.window.showInformationMessage(`Trailing Fun trail is now ${isEnabled ? 'enabled' : 'disabled'}.`);
        updateStatusBar();
        manageAutoSave();
    });

    let disposableQuickMenu = vscode.commands.registerCommand('trailing-fun.showQuickMenu', async () => {
        const options: vscode.QuickPickItem[] = [
            {
                label: isEnabled ? "$(debug-pause) Disable Trail" : "$(play) Enable Trail",
                description: isEnabled ? "⏸️ Pause the magic" : "▶️ Start the fun!",
                detail: isEnabled ? "Temporarily stop the trail effect" : "Activate the colorful trail"
            },
            {
                label: "$(paintcan) Effects & Themes",
                description: `🎨 Current: ${currentTheme}`,
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
                const themes: (vscode.QuickPickItem & { id: string })[] = [
                    { label: '🎲 Random Classic', id: 'classic', detail: 'Random colors for every character.' },
                    { label: '🌈 Rainbow Wave', id: 'rainbow', detail: 'Smooth shifting spectrum trail.' },
                    { label: '📌 Fixed Color', id: 'fixed', detail: 'A single solid color of your choice.' },
                    { label: '🌟 Glowing Aura', id: 'glow', detail: 'Random colors with a soft glowing aura.' },
                    { label: '⚡ Neon Cyberpunk', id: 'neon', detail: 'Intense pulsing pink and cyan glow.' },
                    { label: '🔥 Burning Fire', id: 'fire', detail: 'Layered red/orange burning effect.' },
                    { label: '👾 Digital Glitch', id: 'glitch', detail: 'Digital corruption with jittery shadows.' },
                    { label: '📟 Matrix Rain', id: 'matrix', detail: 'Classic green digital rain effect.' }
                ];

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

    let onDidChangeDisposable = vscode.workspace.onDidChangeTextDocument(event => {
        if (!isEnabled) {
            return;
        }

        const activeEditor = vscode.window.activeTextEditor;
        if (!activeEditor || activeEditor.document !== event.document) {
            return;
        }

        // Always schedule a smart save on any keypress (including backspace, enter, etc.)
        scheduleSmartSave();

        event.contentChanges.forEach(change => {
            // Ignore very large changes (like massive pastes) to avoid performance issues.
            // Increased to 1000 to support most autocompletes while still protecting against huge blocks.
            if (change.text.length === 0 || change.text.length > 1000) {
                return;
            }

            let color = "";
            if (currentMode === 'rainbow') {
                hue = (hue + 10) % 360;
                color = hslToHex(hue, 80, 50);
            } else if (currentMode === 'fixed') {
                color = currentFixedColor;
            } else {
                color = getRandomColor();
            }

            const start = change.range.start;
            const lines = change.text.split('\n');

            // Logic for triggering funny effects
            funnyTriggerCounter++;
            let shouldTriggerFunny = false;

            if (CONTINUOUS_MODES.includes(currentFunnyMode)) {
                shouldTriggerFunny = true;
            } else if (currentFunnyMode !== 'none') {
                if (change.text.includes(' ') || funnyTriggerCounter % 7 === 0) {
                    shouldTriggerFunny = true;
                }
            }

            // Create a separate particle per line to avoid multi-line decoration flicker
            lines.forEach((lineText, index) => {
                if (lineText.trim().length === 0 && lines.length > 1) { return; }
                const line = start.line + index;
                const charStart = index === 0 ? start.character : 0;
                const charEnd = index === 0 && lines.length === 1
                    ? start.character + lineText.length
                    : lineText.length;
                const effectRange = new vscode.Range(line, charStart, line, charEnd);
                new SimpleParticle(activeEditor, effectRange, color, currentFunnyMode, shouldTriggerFunny, currentTrailLength);
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
    stopAnimationLoop();
    clearDecorationCache();
    previousFrameDecorations.clear();
    activeParticles.clear();
    // Always restore auto-save on deactivate/uninstall
    await restoreAutoSave();
}

function startAnimationLoop() {
    if (animationTimer) {
        return;
    }
    animationTimer = setInterval(() => {
        if (activeParticles.size === 0) {
            if (lastActiveParticleCount > 0) {
                // One final clear of all decorations when trail ends
                vscode.window.visibleTextEditors.forEach(editor => {
                    const prevDecos = previousFrameDecorations.get(editor);
                    if (prevDecos) {
                        for (const decoration of prevDecos) {
                            editor.setDecorations(decoration, []);
                        }
                    }
                });
                previousFrameDecorations.clear();
                lastActiveParticleCount = 0;
                // If we've reached here, the trail is long gone, so we can finally stop the loop
                stopAnimationLoop();
            }
            return;
        }
        lastActiveParticleCount = activeParticles.size;

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

        // For each editor, apply diff-based decoration updates (only touch what changed)
        for (const [editor, particles] of editorMap) {
            // Skip editors that have been closed since the particle was created
            if (!vscode.window.visibleTextEditors.includes(editor)) {
                for (const p of particles) { activeParticles.delete(p); }
                previousFrameDecorations.delete(editor);
                continue;
            }

            const decorationGroups = new Map<vscode.TextEditorDecorationType, vscode.Range[]>();

            for (const particle of particles) {
                const alpha = Math.floor(200 * (1 - (particle.count / particle.maxSteps)));
                const decoration = getCachedDecoration(particle, alpha);
                const ranges = decorationGroups.get(decoration) || [];
                ranges.push(particle.range);
                decorationGroups.set(decoration, ranges);
            }

            const currentDecorations = new Set(decorationGroups.keys());
            const prevDecorations = previousFrameDecorations.get(editor) || new Set();

            // Only clear decorations that were active last frame but aren't this frame
            for (const decoration of prevDecorations) {
                if (!currentDecorations.has(decoration)) {
                    editor.setDecorations(decoration, []);
                }
            }

            // Apply this frame's ranges
            for (const [decoration, ranges] of decorationGroups) {
                editor.setDecorations(decoration, ranges);
            }

            previousFrameDecorations.set(editor, currentDecorations);
        }
    }, currentTrailSpeed);
}

function stopAnimationLoop() {
    if (animationTimer) {
        clearInterval(animationTimer);
        animationTimer = undefined;
    }
}

function clearDecorationCache() {
    for (const decoration of decorationCache.values()) {
        decoration.dispose();
    }
    decorationCache.clear();
}

function updateStatusBar() {
    if (!isEnabled) {
        myStatusBarItem.text = `$(sparkle) Trailing Fun (Off)`;
        return;
    }

    myStatusBarItem.text = `$(sparkle) Fun`;
    myStatusBarItem.tooltip = `Click to configure Trailing Fun`;
}
