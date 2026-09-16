import * as assert from 'assert';
import { ComboTracker } from '../../combo';

suite('ComboTracker Test Suite', () => {
    test('increments while keystrokes stay within the timeout', () => {
        const combo = new ComboTracker(1000);
        assert.strictEqual(combo.hit(0).combo, 1);
        assert.strictEqual(combo.hit(500).combo, 2);
        assert.strictEqual(combo.hit(1000).combo, 3);
    });

    test('resets when the idle gap exceeds the timeout', () => {
        const combo = new ComboTracker(1000);
        combo.hit(0);
        combo.hit(500);
        assert.strictEqual(combo.hit(2000).combo, 1);
    });

    test('boundary gap equal to the timeout does not reset', () => {
        const combo = new ComboTracker(1000);
        combo.hit(0);
        assert.strictEqual(combo.hit(1000).combo, 2);
    });

    test('tracks and only reports a record when beating the high score', () => {
        const combo = new ComboTracker(1000, 2);
        assert.strictEqual(combo.hit(0).isRecord, false);
        assert.strictEqual(combo.hit(100).isRecord, false);
        assert.strictEqual(combo.hit(200).isRecord, true);
        assert.strictEqual(combo.highScore, 3);
        assert.strictEqual(combo.hit(300).isRecord, true);
        assert.strictEqual(combo.highScore, 4);
    });

    test('reset clears the current combo but keeps the high score', () => {
        const combo = new ComboTracker(1000);
        combo.hit(0);
        combo.hit(100);
        combo.reset();
        assert.strictEqual(combo.current, 0);
        assert.strictEqual(combo.highScore, 2);
        assert.strictEqual(combo.hit(200).combo, 1);
    });
});