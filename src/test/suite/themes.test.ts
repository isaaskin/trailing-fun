import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { THEMES, EFFECTS, getTheme } from '../../themes';

interface Manifest {
    contributes: {
        configuration: {
            properties: Record<string, { enum?: string[]; enumDescriptions?: string[] }>;
        };
    };
}

const manifestPath = path.join(__dirname, '..', '..', '..', 'package.json');
const manifest: Manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const themeProperty = manifest.contributes.configuration.properties['trailing-fun.theme'];

suite('Theme Registry Test Suite', () => {
    test('theme ids are unique', () => {
        const ids = THEMES.map(t => t.id);
        assert.strictEqual(new Set(ids).size, ids.length);
    });

    test('every theme uses a known effect and a valid color mode', () => {
        for (const theme of THEMES) {
            assert.ok(EFFECTS.includes(theme.effect), `${theme.id} has unknown effect ${theme.effect}`);
            assert.ok(['palette', 'rainbow', 'fixed'].includes(theme.mode), `${theme.id} has unknown mode`);
            if (theme.mode === 'palette') {
                assert.ok(theme.palette && theme.palette.length > 0, `${theme.id} needs a palette`);
            }
        }
    });

    test('registry stays in sync with the package.json enum', () => {
        assert.deepStrictEqual(
            THEMES.map(t => t.id),
            themeProperty.enum,
            'THEMES must match trailing-fun.theme enum in package.json'
        );
        assert.strictEqual(
            themeProperty.enumDescriptions?.length,
            themeProperty.enum?.length,
            'each enum value needs a description'
        );
    });

    test('getTheme falls back to the first theme for unknown ids', () => {
        assert.strictEqual(getTheme('does-not-exist'), THEMES[0]);
        assert.strictEqual(getTheme('matrix').effect, 'matrix');
    });
});