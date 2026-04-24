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

export function getRandomColor(): string {
    return '#' + Math.floor(Math.random() * 0xFFFFFF).toString(16).padStart(6, '0');
}
