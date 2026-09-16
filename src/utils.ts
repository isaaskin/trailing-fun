/**
 * Pads a hex string to ensure it's 2 characters long.
 */
export function padHex(n: number): string {
    const hex = Math.max(0, Math.min(255, n)).toString(16);
    return hex.length === 1 ? '0' + hex : hex;
}

export function getTransparentColor(color: string, opacity: number) {
    return color + padHex(opacity);
}

export function getVisibleTextColor(bgColor: string) {
    // Handle hex with or without alpha
    if (!bgColor || bgColor.length < 7) {
        return "#FFFFFF";
    }
    const r = parseInt(bgColor.slice(1, 3), 16);
    const g = parseInt(bgColor.slice(3, 5), 16);
    const b = parseInt(bgColor.slice(5, 7), 16);
    const yiq = ((r * 299) + (g * 587) + (b * 114)) / 1000;
    return yiq >= 128 ? "#000000" : "#FFFFFF";
}

export function hslToHex(h: number, s: number, l: number) {
    l /= 100;
    const a = s * Math.min(l, 1 - l) / 100;
    const f = (n: number) => {
        const k = (n + h / 30) % 12;
        const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
        return Math.round(255 * color).toString(16).padStart(2, '0');
    };
    return `#${f(0)}${f(8)}${f(4)}`;
}

/**
 * Returns the color if it is a valid #RRGGBB hex, otherwise the fallback.
 */
export function normalizeHexColor(value: string | undefined, fallback: string): string {
    return value && /^#[0-9A-Fa-f]{6}$/.test(value) ? value : fallback;
}

/**
 * Picks a color from a palette. `rand` is injectable for deterministic tests.
 */
export function pickPaletteColor(palette: readonly string[], rand: () => number = Math.random): string {
    return palette[Math.floor(rand() * palette.length)] ?? palette[0];
}

/**
 * Shallow, order-sensitive equality for the decoration range lists we cache.
 * Comparing references is enough because particle ranges are stable objects.
 */
export function arraysShallowEqual<T>(a: readonly T[] | undefined, b: readonly T[]): boolean {
    if (!a || a.length !== b.length) {
        return false;
    }
    for (let i = 0; i < a.length; i++) {
        if (a[i] !== b[i]) {
            return false;
        }
    }
    return true;
}

/**
 * Frame delay that backs off as the number of live particles grows, bounded by
 * `maxDelay`, and never faster than the user's configured `baseSpeed`.
 */
export function frameDelay(particleCount: number, baseSpeed: number, maxDelay: number): number {
    return Math.max(baseSpeed, Math.min(Math.ceil(particleCount / 4), maxDelay));
}
