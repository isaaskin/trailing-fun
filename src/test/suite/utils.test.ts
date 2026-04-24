import * as assert from 'assert';
import { padHex, getTransparentColor, getVisibleTextColor, hslToHex } from '../../utils';

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
});
