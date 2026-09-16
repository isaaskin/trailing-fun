export const EFFECTS = [
    'none',
    'glow',
    'matrix',
    'glitch',
    'fire',
    'neon',
    'aurora',
    'vaporwave',
    'hyperdrive'
] as const;

export type Effect = typeof EFFECTS[number];

export type ColorMode = 'palette' | 'rainbow' | 'fixed';

export interface Theme {
    id: string;
    label: string;
    description: string;
    mode: ColorMode;
    effect: Effect;
    palette?: readonly string[];
}

export const CLASSIC_PALETTE = [
    '#ff5252', '#ff4081', '#e040fb', '#7c4dff', '#536dfe', '#448aff',
    '#40c4ff', '#18ffff', '#64ffda', '#69f0ae', '#b2ff59', '#eeff41',
    '#ffff00', '#ffd740', '#ffab40', '#ff6e40'
] as const;

export const AURORA_PALETTE = [
    '#00ffcc', '#00e5ff', '#1de9b6', '#64ffda',
    '#7c4dff', '#b388ff', '#18ffff', '#69f0ae'
] as const;

export const VAPORWAVE_PALETTE = [
    '#ff6ec7', '#ff2d95', '#ff71ce', '#01cdfe',
    '#05ffa1', '#b967ff', '#fffb96', '#ff00ff'
] as const;

export const HYPERDRIVE_PALETTE = [
    '#8ecaff', '#4fa3ff', '#2f6bff', '#00b0ff',
    '#eaf6ff', '#7c4dff', '#00e5ff', '#ffffff'
] as const;

export const THEMES: readonly Theme[] = [
    { id: 'classic', label: '🎲 Random Classic', description: 'Random vibrant colors for every character', mode: 'palette', effect: 'none', palette: CLASSIC_PALETTE },
    { id: 'rainbow', label: '🌈 Rainbow Wave', description: 'Smooth shifting spectrum trail', mode: 'rainbow', effect: 'none' },
    { id: 'fixed', label: '📌 Fixed Color', description: 'A single solid color of your choice', mode: 'fixed', effect: 'none' },
    { id: 'glow', label: '🌟 Glowing Aura', description: 'Random colors with a soft cinematic glow', mode: 'palette', effect: 'glow', palette: CLASSIC_PALETTE },
    { id: 'neon', label: '⚡ Neon Cyberpunk', description: 'Intense alternating pink and cyan neon', mode: 'fixed', effect: 'neon' },
    { id: 'fire', label: '🔥 Burning Fire', description: 'Layered red, orange, and gold burn effect', mode: 'fixed', effect: 'fire' },
    { id: 'glitch', label: '👾 Digital Glitch', description: 'Jittery cyan/magenta chromatic corruption', mode: 'palette', effect: 'glitch', palette: CLASSIC_PALETTE },
    { id: 'matrix', label: '📟 Matrix Rain', description: 'Classic green digital rain with a dark tint', mode: 'fixed', effect: 'matrix' },
    { id: 'aurora', label: '🌌 Aurora', description: 'Shimmering greens, teals, and violets like northern lights', mode: 'palette', effect: 'aurora', palette: AURORA_PALETTE },
    { id: 'vaporwave', label: '💜 Vaporwave', description: 'Retro pink and cyan glow with chromatic offset', mode: 'palette', effect: 'vaporwave', palette: VAPORWAVE_PALETTE },
    { id: 'hyperdrive', label: '🚀 Hyperdrive', description: 'Blazing blue-white streaks like a jump to lightspeed', mode: 'palette', effect: 'hyperdrive', palette: HYPERDRIVE_PALETTE }
];

export function getTheme(id: string): Theme {
    return THEMES.find(t => t.id === id) ?? THEMES[0];
}
