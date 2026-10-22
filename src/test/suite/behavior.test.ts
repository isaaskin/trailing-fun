import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as vm from 'vm';

// Run the real extension with a small editor API and deterministic timers.
function editorHarness(options: { trailLength?: number; autoSave?: string; state?: Record<string, unknown> } = {}) {
    class Position {
        constructor(public line: number, public character: number) {}
        isAfter(other: Position) {
            return this.line > other.line || (this.line === other.line && this.character > other.character);
        }
    }
    class Range {
        start: Position;
        end: Position;
        constructor(line: number, character: number, endLine: number, endCharacter: number) {
            this.start = new Position(line, character);
            this.end = new Position(endLine, endCharacter);
            if (this.start.isAfter(this.end)) {
                [this.start, this.end] = [this.end, this.start];
            }
        }
    }
    let now = 10000;
    let nextTimer = 0;
    const timers = new Map<number, { callback: () => void; at: number }>();
    const advance = (ms: number) => {
        const until = now + ms;
        for (;;) {
            const next = [...timers].sort((a, b) => a[1].at - b[1].at)[0];
            if (!next || next[1].at > until) { break; }
            now = next[1].at;
            timers.delete(next[0]);
            next[1].callback();
        }
        now = until;
    };
    const state = new Map<string, unknown>(Object.entries(options.state ?? {}));
    const commands = new Map<string, () => unknown>();
    const updates: unknown[][] = [];
    const disposable = { dispose() {} };
    const status = { text: '', tooltip: '', show() {}, dispose() {} };
    let saves = 0;
    const createEditor = () => {
        const decorations = new Map<unknown, readonly Range[]>();
        return {
            document: {
                isDirty: true, isUntitled: false, uri: { scheme: 'file' },
                save: async () => { saves++; return true; }
            },
            decorations,
            setDecorations: (type: unknown, ranges: readonly Range[]) => decorations.set(type, ranges)
        };
    };
    const editor = createEditor();
    const document = editor.document;
    let changeDocument: (event: unknown) => void = () => {};
    let closeDocument: (doc: unknown) => void = () => {};
    const settings: Record<string, unknown> = {
        trailLength: options.trailLength ?? 12, trailSpeed: 50,
        smartAutoSave: true, autoSave: options.autoSave ?? 'afterDelay'
    };
    const vscode = {
        Range,
        ConfigurationTarget: { Global: 1 },
        DecorationRangeBehavior: { ClosedClosed: 0 },
        StatusBarAlignment: { Right: 2 },
        workspace: {
            getConfiguration: (section: string) => ({
                get: (key: string, fallback: unknown) => settings[key] ?? fallback,
                inspect: (key: string) => ({ globalValue: settings[key] }),
                update: async (...args: unknown[]) => { updates.push([section, ...args]); }
            }),
            onDidChangeConfiguration: () => disposable,
            onDidCloseTextDocument: (listener: typeof closeDocument) => {
                closeDocument = listener;
                return disposable;
            },
            onDidChangeTextDocument: (listener: typeof changeDocument) => {
                changeDocument = listener;
                return disposable;
            }
        },
        window: {
            activeTextEditor: editor,
            visibleTextEditors: [editor],
            createStatusBarItem: () => status,
            createTextEditorDecorationType: () => ({ dispose() {} }),
            showInformationMessage: () => {},
            showErrorMessage: () => {}
        },
        commands: {
            registerCommand: (id: string, callback: () => unknown) => {
                commands.set(id, callback);
                return disposable;
            }
        }
    };
    const context = {
        subscriptions: [] as typeof disposable[],
        globalState: {
            get: (key: string, fallback: unknown) => state.get(key) ?? fallback,
            update: async (key: string, value: unknown) => {
                if (value === undefined) { state.delete(key); } else { state.set(key, value); }
            }
        }
    };
    const extensionPath = path.resolve(__dirname, '../../extension.js');
    const exports: { activate?: (context: unknown) => unknown; deactivate?: () => Promise<void> } = {};
    vm.runInNewContext(fs.readFileSync(extensionPath, 'utf8'), {
        exports,
        require: (id: string) => id === 'vscode' ? vscode : require(path.resolve(path.dirname(extensionPath), id)),
        console: { log() {}, error() {} }, process: { env: {} },
        Date: class extends Date { static now() { return now; } },
        setTimeout: (callback: () => void, delay: number) => {
            const id = ++nextTimer;
            timers.set(id, { callback, at: now + delay });
            return id;
        },
        clearTimeout: (id: number) => timers.delete(id)
    }, { filename: extensionPath });
    const ready = Promise.resolve(exports.activate!(context));
    return {
        ready, state, updates, commands, status, timers, advance, editor, createEditor,
        show: (target: typeof editor) => {
            vscode.window.activeTextEditor = target;
            if (!vscode.window.visibleTextEditors.includes(target)) { vscode.window.visibleTextEditors.push(target); }
        },
        close: () => closeDocument(document),
        deactivate: () => exports.deactivate!(),
        saves: () => saves,
        ranges: (target = editor) => [...target.decorations.values()].flat(),
        edit: (text: string, line = 0, character = 0, rangeLength = 0, reason?: number) => changeDocument({
            document,
            reason,
            contentChanges: [{ text, rangeLength, range: new Range(line, character, line, character + rangeLength) }]
        }),
        type: (text: string) => changeDocument({
            document: vscode.window.activeTextEditor.document,
            contentChanges: [{ text, rangeLength: 0, range: new Range(0, 0, 0, 0) }]
        }),
        metadataChange: () => changeDocument({ document, contentChanges: [] })
    };
}

suite('Extension behavior regressions', () => {
    test('multiline insertions highlight the inserted first line at its real column', async () => {
        const editor = editorHarness();
        await editor.ready;
        editor.edit('abc\nxyz', 2, 10);
        editor.advance(50);
        assert.ok(editor.ranges().some(range => range.start.line === 2 && range.start.character === 10 && range.end.character === 13));
        await editor.deactivate();
    });

    test('a one-step trail renders once, then clears', async () => {
        const editor = editorHarness({ trailLength: 1 });
        await editor.ready;
        editor.edit('a');
        editor.advance(50);
        assert.strictEqual(editor.ranges().length, 1);
        editor.advance(50);
        assert.strictEqual(editor.ranges().length, 0);
        await editor.deactivate();
    });

    test('edits before an existing trail clear stale positions', async () => {
        const editor = editorHarness();
        await editor.ready;
        editor.edit('abc', 1, 4);
        editor.advance(50);
        assert.ok(editor.ranges().length > 0);
        editor.edit('', 0, 0, 1);
        assert.strictEqual(editor.ranges().length, 0);
        await editor.deactivate();
    });

    test('typing and metadata events never change save settings or save documents', async () => {
        for (const autoSave of ['off', 'afterDelay', 'onFocusChange']) {
            const editor = editorHarness({ autoSave });
            await editor.ready;
            editor.edit('a');
            editor.metadataChange();
            editor.advance(5000);
            await editor.deactivate();
            assert.deepStrictEqual(editor.updates, [], autoSave);
            assert.strictEqual(editor.saves(), 0, autoSave);
        }
    });

    test('metadata-only events do not start timers or a combo', async () => {
        const editor = editorHarness();
        await editor.ready;
        const text = editor.status.text;
        editor.metadataChange();
        assert.strictEqual(editor.timers.size, 0);
        assert.strictEqual(editor.status.text, text);
        await editor.deactivate();
    });

    test('undo and redo clear trails without creating new effects', async () => {
        for (const reason of [1, 2]) {
            const editor = editorHarness();
            await editor.ready;
            editor.edit('a');
            editor.advance(50);
            editor.edit('b', 0, 0, 1, reason);
            editor.advance(50);
            assert.strictEqual(editor.ranges().length, 0);
            await editor.deactivate();
        }
    });

    test('a background document edit clears stale decorations after switching editors', async () => {
        const editor = editorHarness();
        await editor.ready;
        editor.edit('a', 1, 4);
        editor.advance(50);
        editor.show(editor.createEditor());
        editor.edit('', 0, 0, 1);
        assert.strictEqual(editor.ranges().length, 0);
        await editor.deactivate();
    });

    test('expired decorations clear while another editor continues animating', async () => {
        const editor = editorHarness({ trailLength: 1 });
        await editor.ready;
        editor.edit('a');
        editor.advance(50);
        const other = editor.createEditor();
        editor.show(other);
        editor.type('b');
        editor.advance(50);
        assert.strictEqual(editor.ranges().length, 0);
        assert.strictEqual(editor.ranges(other).length, 1);
        await editor.deactivate();
    });

    test('closing a document immediately clears its particles', async () => {
        const editor = editorHarness();
        await editor.ready;
        editor.edit('a');
        editor.advance(50);
        editor.close();
        assert.strictEqual(editor.ranges().length, 0);
        editor.advance(50);
        assert.strictEqual(editor.ranges().length, 0);
        await editor.deactivate();
    });

    test('disabled state is restored and toggle changes are persisted', async () => {
        const editor = editorHarness({ state: { 'trailing-fun.enabled': false } });
        await editor.ready;
        assert.ok(editor.status.text.includes('Off'));
        editor.edit('a');
        assert.strictEqual(editor.timers.size, 0);
        await editor.commands.get('trailing-fun.toggle')!();
        assert.strictEqual(editor.state.get('trailing-fun.enabled'), true);
        await editor.commands.get('trailing-fun.toggle')!();
        assert.strictEqual(editor.state.get('trailing-fun.enabled'), false);
        await editor.deactivate();
    });

    test('deactivation cancels every animation and status timer', async () => {
        const editor = editorHarness();
        await editor.ready;
        editor.edit('a');
        await editor.deactivate();
        assert.strictEqual(editor.timers.size, 0);
    });

    test('legacy save recovery does not overwrite a newer save preference', async () => {
        const editor = editorHarness({ autoSave: 'onFocusChange', state: { originalAutoSave: 'afterDelay' } });
        await editor.ready;
        await editor.deactivate();
        assert.deepStrictEqual(editor.updates, []);
        assert.strictEqual(editor.state.has('originalAutoSave'), false);
    });

    test('legacy save recovery restores global off once and clears its marker', async () => {
        const editor = editorHarness({ autoSave: 'off', state: { originalAutoSave: 'afterDelay' } });
        await editor.ready;
        assert.deepStrictEqual(editor.updates, [['files', 'autoSave', 'afterDelay', 1]]);
        assert.strictEqual(editor.state.has('originalAutoSave'), false);
        await editor.deactivate();
        assert.strictEqual(editor.updates.length, 1);
    });
});
