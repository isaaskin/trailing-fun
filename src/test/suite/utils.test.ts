import * as assert from 'assert';
import { padHex, getTransparentColor, getVisibleTextColor, hslToHex, normalizeHexColor, pickPaletteColor, arraysShallowEqual, frameDelay } from '../../utils';

suite('Utility Functions Test Suite', () => {
    test('padHex should pad single digit hex numbers', () => {
        assert.strictEqual(padHex(0), '00');
        assert.strictEqual(padHex(10), '0a');
        assert.strictEqual(padHex(15), '0f');
        assert.strictEqual(padHex(16), '10');
        assert.strictEqual(padHex(255), 'ff');
    });

    test('padHex should cap values between 0 and 255', () => {
        assert.strictEqual(padHex(-10), '00');
        assert.strictEqual(padHex(300), 'ff');
    });

    test('getTransparentColor should append alpha to hex', () => {
        assert.strictEqual(getTransparentColor('#ff0000', 128), '#ff000080');
        assert.strictEqual(getTransparentColor('#00ff00', 255), '#00ff00ff');
    });

    test('getVisibleTextColor should return black for light colors', () => {
        assert.strictEqual(getVisibleTextColor('#ffffff'), '#000000');
        assert.strictEqual(getVisibleTextColor('#ffff00'), '#000000'); // yellow
    });

    test('getVisibleTextColor should return white for dark colors', () => {
        assert.strictEqual(getVisibleTextColor('#000000'), '#FFFFFF');
        assert.strictEqual(getVisibleTextColor('#0000ff'), '#FFFFFF'); // blue
    });

    test('hslToHex should convert HSL to Hex correctly', () => {
        assert.strictEqual(hslToHex(0, 100, 50), '#ff0000');
        assert.strictEqual(hslToHex(120, 100, 50), '#00ff00');
        assert.strictEqual(hslToHex(240, 100, 50), '#0000ff');
    });

    test('normalizeHexColor should accept valid hex and reject anything else', () => {
        assert.strictEqual(normalizeHexColor('#AbC123', '#000000'), '#AbC123');
        assert.strictEqual(normalizeHexColor('red', '#000000'), '#000000');
        assert.strictEqual(normalizeHexColor('#12345', '#000000'), '#000000');
        assert.strictEqual(normalizeHexColor(undefined, '#007acc'), '#007acc');
    });

    test('pickPaletteColor should choose deterministically from injected randomness', () => {
        const palette = ['#111111', '#222222', '#333333'];
        assert.strictEqual(pickPaletteColor(palette, () => 0), '#111111');
        assert.strictEqual(pickPaletteColor(palette, () => 0.99), '#333333');
    });

    test('pickPaletteColor should not return undefined for a full random range', () => {
        const palette = ['#111111', '#222222'];
        for (let i = 0; i < 100; i++) {
            assert.ok(palette.includes(pickPaletteColor(palette)));
        }
    });

    test('arraysShallowEqual compares by identity and order', () => {
        const a = {};
        const b = {};
        assert.strictEqual(arraysShallowEqual(undefined, []), false);
        assert.strictEqual(arraysShallowEqual([], [a]), false);
        assert.strictEqual(arraysShallowEqual([a, b], [a, b]), true);
        assert.strictEqual(arraysShallowEqual([a, b], [b, a]), false);
        assert.strictEqual(arraysShallowEqual([a], [{}]), false);
    });

    test('frameDelay never goes below the base speed and backs off under load', () => {
        assert.strictEqual(frameDelay(0, 50, 250), 50);
        assert.strictEqual(frameDelay(100, 50, 250), 50);
        assert.strictEqual(frameDelay(400, 50, 250), 100);
        assert.strictEqual(frameDelay(800, 50, 250), 200);
        assert.strictEqual(frameDelay(8000, 50, 250), 250);
        assert.strictEqual(frameDelay(800, 500, 250), 500);
    });
});
