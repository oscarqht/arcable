import { isDarkColor } from './treeUtils';

export interface SpaceThemeTokens {
  containerBg: string;
  primaryColor: string;
  isDark: boolean;
  textColor: string;
  subtextColor: string;
  badgeBg: string;
  badgeText: string;
  inputBg: string;
  inputPlaceholder: string;
  actionHoverBg: string;
  borderColor: string;
  cardBorder: string;
  cardBoxShadow: string;
  shelfBg: string;
}

export interface PresetThemeItem {
  id: string;
  name: string;
  value: string;
  primary: string;
  isDark: boolean;
  tokens: Omit<SpaceThemeTokens, 'containerBg' | 'primaryColor'>;
}

export const PRESET_GRADIENTS: PresetThemeItem[] = [
  {
    id: 'warm-silk',
    name: 'Warm Silk',
    value: 'linear-gradient(135deg, #fdfbf7 0%, #f7ede2 50%, #f4dec6 100%)',
    primary: '#ebd5be',
    isDark: false,
    tokens: {
      isDark: false,
      textColor: '#2c2923',
      subtextColor: 'rgba(44, 41, 35, 0.72)',
      badgeBg: 'rgba(0, 0, 0, 0.07)',
      badgeText: '#2c2923',
      inputBg: 'rgba(0, 0, 0, 0.05)',
      inputPlaceholder: 'rgba(44, 41, 35, 0.55)',
      actionHoverBg: 'rgba(0, 0, 0, 0.08)',
      borderColor: 'rgba(44, 41, 35, 0.12)',
      cardBorder: 'none',
      cardBoxShadow: 'inset 0 0 0 1px rgba(255, 255, 255, 0.5), inset 0 1px 0 rgba(255, 255, 255, 0.4), 0 4px 16px rgba(0, 0, 0, 0.04), 0 1px 3px rgba(0, 0, 0, 0.02)',
      shelfBg: 'rgba(0, 0, 0, 0.04)',
    },
  },
  {
    id: 'blossom',
    name: 'Blossom Rose',
    value: 'linear-gradient(135deg, #fde4eb 0%, #f8b8cf 50%, #f089ad 100%)',
    primary: '#f089ad',
    isDark: false,
    tokens: {
      isDark: false,
      textColor: '#471b2b',
      subtextColor: 'rgba(71, 27, 43, 0.75)',
      badgeBg: 'rgba(255, 255, 255, 0.45)',
      badgeText: '#471b2b',
      inputBg: 'rgba(255, 255, 255, 0.38)',
      inputPlaceholder: 'rgba(71, 27, 43, 0.58)',
      actionHoverBg: 'rgba(255, 255, 255, 0.4)',
      borderColor: 'rgba(71, 27, 43, 0.14)',
      cardBorder: 'none',
      cardBoxShadow: 'inset 0 0 0 1px rgba(255, 255, 255, 0.45), inset 0 1px 0 rgba(255, 255, 255, 0.35), 0 4px 16px rgba(0, 0, 0, 0.04), 0 1px 3px rgba(0, 0, 0, 0.02)',
      shelfBg: 'rgba(255, 255, 255, 0.3)',
    },
  },
  {
    id: 'lilac',
    name: 'Lilac Orchid',
    value: 'linear-gradient(135deg, #f3e8ff 0%, #dab8fc 50%, #ba72fd 100%)',
    primary: '#ba72fd',
    isDark: false,
    tokens: {
      isDark: false,
      textColor: '#2e1065',
      subtextColor: 'rgba(46, 16, 101, 0.75)',
      badgeBg: 'rgba(255, 255, 255, 0.45)',
      badgeText: '#2e1065',
      inputBg: 'rgba(255, 255, 255, 0.38)',
      inputPlaceholder: 'rgba(46, 16, 101, 0.58)',
      actionHoverBg: 'rgba(255, 255, 255, 0.4)',
      borderColor: 'rgba(46, 16, 101, 0.14)',
      cardBorder: 'none',
      cardBoxShadow: 'inset 0 0 0 1px rgba(255, 255, 255, 0.45), inset 0 1px 0 rgba(255, 255, 255, 0.35), 0 4px 16px rgba(0, 0, 0, 0.04), 0 1px 3px rgba(0, 0, 0, 0.02)',
      shelfBg: 'rgba(255, 255, 255, 0.3)',
    },
  },
  {
    id: 'peach-coral',
    name: 'Peach Coral',
    value: 'linear-gradient(135deg, #fed7aa 0%, #fca5a5 50%, #f67280 100%)',
    primary: '#f67280',
    isDark: false,
    tokens: {
      isDark: false,
      textColor: '#4c0519',
      subtextColor: 'rgba(76, 5, 25, 0.75)',
      badgeBg: 'rgba(255, 255, 255, 0.45)',
      badgeText: '#4c0519',
      inputBg: 'rgba(255, 255, 255, 0.38)',
      inputPlaceholder: 'rgba(76, 5, 25, 0.58)',
      actionHoverBg: 'rgba(255, 255, 255, 0.4)',
      borderColor: 'rgba(76, 5, 25, 0.14)',
      cardBorder: 'none',
      cardBoxShadow: 'inset 0 0 0 1px rgba(255, 255, 255, 0.45), inset 0 1px 0 rgba(255, 255, 255, 0.35), 0 4px 16px rgba(0, 0, 0, 0.04), 0 1px 3px rgba(0, 0, 0, 0.02)',
      shelfBg: 'rgba(255, 255, 255, 0.3)',
    },
  },
  {
    id: 'sunset',
    name: 'Sunset Glow',
    value: 'linear-gradient(135deg, #fef3c7 0%, #fed7aa 50%, #fb923c 100%)',
    primary: '#fb923c',
    isDark: false,
    tokens: {
      isDark: false,
      textColor: '#451a03',
      subtextColor: 'rgba(69, 26, 3, 0.75)',
      badgeBg: 'rgba(255, 255, 255, 0.45)',
      badgeText: '#451a03',
      inputBg: 'rgba(255, 255, 255, 0.38)',
      inputPlaceholder: 'rgba(69, 26, 3, 0.58)',
      actionHoverBg: 'rgba(255, 255, 255, 0.4)',
      borderColor: 'rgba(69, 26, 3, 0.14)',
      cardBorder: 'none',
      cardBoxShadow: 'inset 0 0 0 1px rgba(255, 255, 255, 0.45), inset 0 1px 0 rgba(255, 255, 255, 0.35), 0 4px 16px rgba(0, 0, 0, 0.04), 0 1px 3px rgba(0, 0, 0, 0.02)',
      shelfBg: 'rgba(255, 255, 255, 0.3)',
    },
  },
  {
    id: 'matcha',
    name: 'Matcha Lime',
    value: 'linear-gradient(135deg, #ecfccb 0%, #d9f99d 50%, #a3e635 100%)',
    primary: '#84cc16',
    isDark: false,
    tokens: {
      isDark: false,
      textColor: '#1a2e05',
      subtextColor: 'rgba(26, 46, 5, 0.75)',
      badgeBg: 'rgba(255, 255, 255, 0.45)',
      badgeText: '#1a2e05',
      inputBg: 'rgba(255, 255, 255, 0.38)',
      inputPlaceholder: 'rgba(26, 46, 5, 0.58)',
      actionHoverBg: 'rgba(255, 255, 255, 0.4)',
      borderColor: 'rgba(26, 46, 5, 0.14)',
      cardBorder: 'none',
      cardBoxShadow: 'inset 0 0 0 1px rgba(255, 255, 255, 0.45), inset 0 1px 0 rgba(255, 255, 255, 0.35), 0 4px 16px rgba(0, 0, 0, 0.04), 0 1px 3px rgba(0, 0, 0, 0.02)',
      shelfBg: 'rgba(255, 255, 255, 0.3)',
    },
  },
  {
    id: 'mint-lagoon',
    name: 'Mint Lagoon',
    value: 'linear-gradient(135deg, #6ee7b7 0%, #34d399 45%, #38bdf8 100%)',
    primary: '#10b981',
    isDark: false,
    tokens: {
      isDark: false,
      textColor: '#064e3b',
      subtextColor: 'rgba(6, 78, 59, 0.75)',
      badgeBg: 'rgba(255, 255, 255, 0.45)',
      badgeText: '#064e3b',
      inputBg: 'rgba(255, 255, 255, 0.38)',
      inputPlaceholder: 'rgba(6, 78, 59, 0.58)',
      actionHoverBg: 'rgba(255, 255, 255, 0.4)',
      borderColor: 'rgba(6, 78, 59, 0.14)',
      cardBorder: 'none',
      cardBoxShadow: 'inset 0 0 0 1px rgba(255, 255, 255, 0.45), inset 0 1px 0 rgba(255, 255, 255, 0.35), 0 4px 16px rgba(0, 0, 0, 0.04), 0 1px 3px rgba(0, 0, 0, 0.02)',
      shelfBg: 'rgba(255, 255, 255, 0.3)',
    },
  },
  {
    id: 'mineral-slate',
    name: 'Mineral Slate',
    value: 'linear-gradient(135deg, #e2e8f0 0%, #94a3b8 50%, #64748b 100%)',
    primary: '#64748b',
    isDark: false,
    tokens: {
      isDark: false,
      textColor: '#0f172a',
      subtextColor: 'rgba(15, 23, 42, 0.75)',
      badgeBg: 'rgba(255, 255, 255, 0.45)',
      badgeText: '#0f172a',
      inputBg: 'rgba(255, 255, 255, 0.38)',
      inputPlaceholder: 'rgba(15, 23, 42, 0.58)',
      actionHoverBg: 'rgba(255, 255, 255, 0.4)',
      borderColor: 'rgba(15, 23, 42, 0.14)',
      cardBorder: 'none',
      cardBoxShadow: 'inset 0 0 0 1px rgba(255, 255, 255, 0.45), inset 0 1px 0 rgba(255, 255, 255, 0.35), 0 4px 16px rgba(0, 0, 0, 0.04), 0 1px 3px rgba(0, 0, 0, 0.02)',
      shelfBg: 'rgba(255, 255, 255, 0.3)',
    },
  },
];

export const PRESET_SOLID_COLORS = [
  '#f29bbb', // Blossom Pink
  '#a6729e', // Purple Mauve
  '#f25e6c', // Coral Red
  '#ff8657', // Warm Orange
  '#f8d558', // Sunny Yellow
  '#33e895', // Mint Green
  '#6dbad9', // Sky Blue
  '#666789', // Slate Indigo
];

// Mapping of known solid presets to refined theme tokens
const SOLID_PALETTE_MAP: Record<string, { primary: string; isDark: boolean; tokens: Omit<SpaceThemeTokens, 'containerBg' | 'primaryColor'> }> = {
  '#f29bbb': {
    primary: '#f29bbb',
    isDark: false,
    tokens: {
      isDark: false,
      textColor: '#471b2b',
      subtextColor: 'rgba(71, 27, 43, 0.75)',
      badgeBg: 'rgba(255, 255, 255, 0.45)',
      badgeText: '#471b2b',
      inputBg: 'rgba(255, 255, 255, 0.38)',
      inputPlaceholder: 'rgba(71, 27, 43, 0.58)',
      actionHoverBg: 'rgba(255, 255, 255, 0.4)',
      borderColor: 'rgba(71, 27, 43, 0.12)',
      cardBorder: 'none',
      cardBoxShadow: 'inset 0 0 0 1px rgba(255, 255, 255, 0.45), inset 0 1px 0 rgba(255, 255, 255, 0.35), 0 4px 16px rgba(0, 0, 0, 0.04), 0 1px 3px rgba(0, 0, 0, 0.02)',
      shelfBg: 'rgba(255, 255, 255, 0.3)',
    },
  },
  '#a6729e': {
    primary: '#a6729e',
    isDark: true,
    tokens: {
      isDark: true,
      textColor: '#ffffff',
      subtextColor: 'rgba(255, 255, 255, 0.85)',
      badgeBg: 'rgba(255, 255, 255, 0.25)',
      badgeText: '#ffffff',
      inputBg: 'rgba(255, 255, 255, 0.2)',
      inputPlaceholder: 'rgba(255, 255, 255, 0.7)',
      actionHoverBg: 'rgba(255, 255, 255, 0.22)',
      borderColor: 'rgba(255, 255, 255, 0.18)',
      cardBorder: 'none',
      cardBoxShadow: 'inset 0 0 0 1px rgba(255, 255, 255, 0.15), 0 4px 20px rgba(0, 0, 0, 0.25), 0 1px 3px rgba(0, 0, 0, 0.15)',
      shelfBg: 'rgba(255, 255, 255, 0.16)',
    },
  },
  '#f25e6c': {
    primary: '#f25e6c',
    isDark: true,
    tokens: {
      isDark: true,
      textColor: '#ffffff',
      subtextColor: 'rgba(255, 255, 255, 0.85)',
      badgeBg: 'rgba(255, 255, 255, 0.25)',
      badgeText: '#ffffff',
      inputBg: 'rgba(255, 255, 255, 0.2)',
      inputPlaceholder: 'rgba(255, 255, 255, 0.7)',
      actionHoverBg: 'rgba(255, 255, 255, 0.22)',
      borderColor: 'rgba(255, 255, 255, 0.18)',
      cardBorder: 'none',
      cardBoxShadow: 'inset 0 0 0 1px rgba(255, 255, 255, 0.15), 0 4px 20px rgba(0, 0, 0, 0.25), 0 1px 3px rgba(0, 0, 0, 0.15)',
      shelfBg: 'rgba(255, 255, 255, 0.16)',
    },
  },
  '#ff8657': {
    primary: '#ff8657',
    isDark: false,
    tokens: {
      isDark: false,
      textColor: '#42160d',
      subtextColor: 'rgba(66, 22, 13, 0.75)',
      badgeBg: 'rgba(255, 255, 255, 0.42)',
      badgeText: '#42160d',
      inputBg: 'rgba(255, 255, 255, 0.35)',
      inputPlaceholder: 'rgba(66, 22, 13, 0.58)',
      actionHoverBg: 'rgba(255, 255, 255, 0.35)',
      borderColor: 'rgba(66, 22, 13, 0.12)',
      cardBorder: 'none',
      cardBoxShadow: 'inset 0 0 0 1px rgba(255, 255, 255, 0.45), inset 0 1px 0 rgba(255, 255, 255, 0.35), 0 4px 16px rgba(0, 0, 0, 0.04), 0 1px 3px rgba(0, 0, 0, 0.02)',
      shelfBg: 'rgba(255, 255, 255, 0.28)',
    },
  },
  '#f8d558': {
    primary: '#f8d558',
    isDark: false,
    tokens: {
      isDark: false,
      textColor: '#38310c',
      subtextColor: 'rgba(56, 49, 12, 0.75)',
      badgeBg: 'rgba(255, 255, 255, 0.45)',
      badgeText: '#38310c',
      inputBg: 'rgba(255, 255, 255, 0.38)',
      inputPlaceholder: 'rgba(56, 49, 12, 0.58)',
      actionHoverBg: 'rgba(255, 255, 255, 0.4)',
      borderColor: 'rgba(56, 49, 12, 0.12)',
      cardBorder: 'none',
      cardBoxShadow: 'inset 0 0 0 1px rgba(255, 255, 255, 0.45), inset 0 1px 0 rgba(255, 255, 255, 0.35), 0 4px 16px rgba(0, 0, 0, 0.04), 0 1px 3px rgba(0, 0, 0, 0.02)',
      shelfBg: 'rgba(255, 255, 255, 0.3)',
    },
  },
  '#33e895': {
    primary: '#33e895',
    isDark: false,
    tokens: {
      isDark: false,
      textColor: '#0c3e2c',
      subtextColor: 'rgba(12, 62, 44, 0.75)',
      badgeBg: 'rgba(255, 255, 255, 0.45)',
      badgeText: '#0c3e2c',
      inputBg: 'rgba(255, 255, 255, 0.38)',
      inputPlaceholder: 'rgba(12, 62, 44, 0.58)',
      actionHoverBg: 'rgba(255, 255, 255, 0.4)',
      borderColor: 'rgba(12, 62, 44, 0.12)',
      cardBorder: 'none',
      cardBoxShadow: 'inset 0 0 0 1px rgba(255, 255, 255, 0.45), inset 0 1px 0 rgba(255, 255, 255, 0.35), 0 4px 16px rgba(0, 0, 0, 0.04), 0 1px 3px rgba(0, 0, 0, 0.02)',
      shelfBg: 'rgba(255, 255, 255, 0.3)',
    },
  },
  '#6dbad9': {
    primary: '#6dbad9',
    isDark: false,
    tokens: {
      isDark: false,
      textColor: '#103444',
      subtextColor: 'rgba(16, 52, 68, 0.75)',
      badgeBg: 'rgba(255, 255, 255, 0.45)',
      badgeText: '#103444',
      inputBg: 'rgba(255, 255, 255, 0.38)',
      inputPlaceholder: 'rgba(16, 52, 68, 0.58)',
      actionHoverBg: 'rgba(255, 255, 255, 0.4)',
      borderColor: 'rgba(16, 52, 68, 0.12)',
      cardBorder: 'none',
      cardBoxShadow: 'inset 0 0 0 1px rgba(255, 255, 255, 0.45), inset 0 1px 0 rgba(255, 255, 255, 0.35), 0 4px 16px rgba(0, 0, 0, 0.04), 0 1px 3px rgba(0, 0, 0, 0.02)',
      shelfBg: 'rgba(255, 255, 255, 0.3)',
    },
  },
  '#666789': {
    primary: '#666789',
    isDark: true,
    tokens: {
      isDark: true,
      textColor: '#ffffff',
      subtextColor: 'rgba(255, 255, 255, 0.85)',
      badgeBg: 'rgba(255, 255, 255, 0.25)',
      badgeText: '#ffffff',
      inputBg: 'rgba(255, 255, 255, 0.2)',
      inputPlaceholder: 'rgba(255, 255, 255, 0.7)',
      actionHoverBg: 'rgba(255, 255, 255, 0.22)',
      borderColor: 'rgba(255, 255, 255, 0.18)',
      cardBorder: 'none',
      cardBoxShadow: 'inset 0 0 0 1px rgba(255, 255, 255, 0.15), 0 4px 20px rgba(0, 0, 0, 0.25), 0 1px 3px rgba(0, 0, 0, 0.15)',
      shelfBg: 'rgba(255, 255, 255, 0.16)',
    },
  },
  // Backward compatibility palette items
  '#f4efdf': {
    primary: '#f4efdf',
    isDark: false,
    tokens: {
      isDark: false,
      textColor: '#2c2923',
      subtextColor: 'rgba(44, 41, 35, 0.72)',
      badgeBg: 'rgba(0, 0, 0, 0.06)',
      badgeText: '#2c2923',
      inputBg: 'rgba(0, 0, 0, 0.04)',
      inputPlaceholder: 'rgba(44, 41, 35, 0.55)',
      actionHoverBg: 'rgba(0, 0, 0, 0.07)',
      borderColor: 'rgba(44, 41, 35, 0.1)',
      cardBorder: 'none',
      cardBoxShadow: 'inset 0 0 0 1px rgba(255, 255, 255, 0.45), inset 0 1px 0 rgba(255, 255, 255, 0.35), 0 4px 16px rgba(0, 0, 0, 0.04), 0 1px 3px rgba(0, 0, 0, 0.02)',
      shelfBg: 'rgba(0, 0, 0, 0.04)',
    },
  },
  '#f0b8cd': {
    primary: '#f0b8cd',
    isDark: false,
    tokens: {
      isDark: false,
      textColor: '#471b2b',
      subtextColor: 'rgba(71, 27, 43, 0.72)',
      badgeBg: 'rgba(255, 255, 255, 0.45)',
      badgeText: '#471b2b',
      inputBg: 'rgba(255, 255, 255, 0.38)',
      inputPlaceholder: 'rgba(71, 27, 43, 0.58)',
      actionHoverBg: 'rgba(255, 255, 255, 0.4)',
      borderColor: 'rgba(71, 27, 43, 0.12)',
      cardBorder: 'none',
      cardBoxShadow: 'inset 0 0 0 1px rgba(255, 255, 255, 0.45), inset 0 1px 0 rgba(255, 255, 255, 0.35), 0 4px 16px rgba(0, 0, 0, 0.04), 0 1px 3px rgba(0, 0, 0, 0.02)',
      shelfBg: 'rgba(255, 255, 255, 0.3)',
    },
  },
  '#e9c3e3': {
    primary: '#e9c3e3',
    isDark: false,
    tokens: {
      isDark: false,
      textColor: '#3f1e3c',
      subtextColor: 'rgba(63, 30, 60, 0.72)',
      badgeBg: 'rgba(255, 255, 255, 0.45)',
      badgeText: '#3f1e3c',
      inputBg: 'rgba(255, 255, 255, 0.38)',
      inputPlaceholder: 'rgba(63, 30, 60, 0.58)',
      actionHoverBg: 'rgba(255, 255, 255, 0.4)',
      borderColor: 'rgba(63, 30, 60, 0.12)',
      cardBorder: 'none',
      cardBoxShadow: 'inset 0 0 0 1px rgba(255, 255, 255, 0.45), inset 0 1px 0 rgba(255, 255, 255, 0.35), 0 4px 16px rgba(0, 0, 0, 0.04), 0 1px 3px rgba(0, 0, 0, 0.02)',
      shelfBg: 'rgba(255, 255, 255, 0.3)',
    },
  },
  '#da7682': {
    primary: '#da7682',
    isDark: true,
    tokens: {
      isDark: true,
      textColor: '#ffffff',
      subtextColor: 'rgba(255, 255, 255, 0.85)',
      badgeBg: 'rgba(255, 255, 255, 0.25)',
      badgeText: '#ffffff',
      inputBg: 'rgba(255, 255, 255, 0.2)',
      inputPlaceholder: 'rgba(255, 255, 255, 0.7)',
      actionHoverBg: 'rgba(255, 255, 255, 0.22)',
      borderColor: 'rgba(255, 255, 255, 0.18)',
      cardBorder: 'none',
      cardBoxShadow: 'inset 0 0 0 1px rgba(255, 255, 255, 0.15), 0 4px 20px rgba(0, 0, 0, 0.25), 0 1px 3px rgba(0, 0, 0, 0.15)',
      shelfBg: 'rgba(255, 255, 255, 0.16)',
    },
  },
  '#eb8570': {
    primary: '#eb8570',
    isDark: false,
    tokens: {
      isDark: false,
      textColor: '#42160d',
      subtextColor: 'rgba(66, 22, 13, 0.72)',
      badgeBg: 'rgba(255, 255, 255, 0.42)',
      badgeText: '#42160d',
      inputBg: 'rgba(255, 255, 255, 0.35)',
      inputPlaceholder: 'rgba(66, 22, 13, 0.58)',
      actionHoverBg: 'rgba(255, 255, 255, 0.35)',
      borderColor: 'rgba(66, 22, 13, 0.12)',
      cardBorder: 'none',
      cardBoxShadow: 'inset 0 0 0 1px rgba(255, 255, 255, 0.45), inset 0 1px 0 rgba(255, 255, 255, 0.35), 0 4px 16px rgba(0, 0, 0, 0.04), 0 1px 3px rgba(0, 0, 0, 0.02)',
      shelfBg: 'rgba(255, 255, 255, 0.28)',
    },
  },
  '#dcce7f': {
    primary: '#dcce7f',
    isDark: false,
    tokens: {
      isDark: false,
      textColor: '#38310c',
      subtextColor: 'rgba(56, 49, 12, 0.72)',
      badgeBg: 'rgba(255, 255, 255, 0.45)',
      badgeText: '#38310c',
      inputBg: 'rgba(255, 255, 255, 0.38)',
      inputPlaceholder: 'rgba(56, 49, 12, 0.58)',
      actionHoverBg: 'rgba(255, 255, 255, 0.4)',
      borderColor: 'rgba(56, 49, 12, 0.12)',
      cardBorder: 'none',
      cardBoxShadow: 'inset 0 0 0 1px rgba(255, 255, 255, 0.45), inset 0 1px 0 rgba(255, 255, 255, 0.35), 0 4px 16px rgba(0, 0, 0, 0.04), 0 1px 3px rgba(0, 0, 0, 0.02)',
      shelfBg: 'rgba(255, 255, 255, 0.3)',
    },
  },
  '#5becad': {
    primary: '#5becad',
    isDark: false,
    tokens: {
      isDark: false,
      textColor: '#0c3e2c',
      subtextColor: 'rgba(12, 62, 44, 0.72)',
      badgeBg: 'rgba(255, 255, 255, 0.45)',
      badgeText: '#0c3e2c',
      inputBg: 'rgba(255, 255, 255, 0.38)',
      inputPlaceholder: 'rgba(12, 62, 44, 0.58)',
      actionHoverBg: 'rgba(255, 255, 255, 0.4)',
      borderColor: 'rgba(12, 62, 44, 0.12)',
      cardBorder: 'none',
      cardBoxShadow: 'inset 0 0 0 1px rgba(255, 255, 255, 0.45), inset 0 1px 0 rgba(255, 255, 255, 0.35), 0 4px 16px rgba(0, 0, 0, 0.04), 0 1px 3px rgba(0, 0, 0, 0.02)',
      shelfBg: 'rgba(255, 255, 255, 0.3)',
    },
  },
  '#919bb5': {
    primary: '#919bb5',
    isDark: false,
    tokens: {
      isDark: false,
      textColor: '#152033',
      subtextColor: 'rgba(21, 32, 51, 0.72)',
      badgeBg: 'rgba(255, 255, 255, 0.4)',
      badgeText: '#152033',
      inputBg: 'rgba(255, 255, 255, 0.35)',
      inputPlaceholder: 'rgba(21, 32, 51, 0.58)',
      actionHoverBg: 'rgba(255, 255, 255, 0.35)',
      borderColor: 'rgba(21, 32, 51, 0.12)',
      cardBorder: 'none',
      cardBoxShadow: 'inset 0 0 0 1px rgba(255, 255, 255, 0.45), inset 0 1px 0 rgba(255, 255, 255, 0.35), 0 4px 16px rgba(0, 0, 0, 0.04), 0 1px 3px rgba(0, 0, 0, 0.02)',
      shelfBg: 'rgba(255, 255, 255, 0.28)',
    },
  },
};

/**
 * Extracts a valid primary/solid representation color for a theme (useful for pills, indicator dots, borders)
 */
export function getSpacePrimaryColor(color?: string | null): string {
  if (!color || typeof color !== 'string' || !color.trim()) {
    return '#3b82f6';
  }

  const trimmed = color.trim();

  // Match preset gradient
  const matchedGradient = PRESET_GRADIENTS.find((g) => g.value === trimmed || g.id === trimmed);
  if (matchedGradient) {
    return matchedGradient.primary;
  }

  // If gradient string, extract first hex match
  if (trimmed.includes('gradient')) {
    const hexMatch = trimmed.match(/#(?:[0-9a-fA-F]{3}){1,2}\b/);
    if (hexMatch) {
      return hexMatch[0];
    }
    return '#3b82f6';
  }

  // Solid preset
  const lower = trimmed.toLowerCase();
  if (SOLID_PALETTE_MAP[lower]) {
    return SOLID_PALETTE_MAP[lower].primary;
  }

  return trimmed;
}

/**
 * Generates comprehensive theme tokens for space rendering (supporting soft smooth gradients and solid colors)
 */
/**
 * Parses a hex color string into [r, g, b] (0-255)
 */
function parseHexColor(hex: string): [number, number, number] | null {
  const clean = hex.replace('#', '').trim();
  if (clean.length === 3) {
    const r = parseInt(clean[0] + clean[0], 16);
    const g = parseInt(clean[1] + clean[1], 16);
    const b = parseInt(clean[2] + clean[2], 16);
    return [r, g, b];
  }
  if (clean.length === 6) {
    const r = parseInt(clean.substring(0, 2), 16);
    const g = parseInt(clean.substring(2, 4), 16);
    const b = parseInt(clean.substring(4, 6), 16);
    return [r, g, b];
  }
  return null;
}

/**
 * Converts RGB to HSL ([0..360], [0..1], [0..1])
 */
function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0);
        break;
      case g:
        h = (b - r) / d + 2;
        break;
      case b:
        h = (r - g) / d + 4;
        break;
    }
    h /= 6;
  }

  return [h * 360, s, l];
}

/**
 * Converts HSL to Hex
 */
function hslToHex(h: number, s: number, l: number): string {
  h = ((h % 360) + 360) % 360;
  s = Math.max(0, Math.min(1, s));
  l = Math.max(0, Math.min(1, l));

  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0;
  let g = 0;
  let b = 0;

  if (0 <= h && h < 60) {
    r = c; g = x; b = 0;
  } else if (60 <= h && h < 120) {
    r = x; g = c; b = 0;
  } else if (120 <= h && h < 180) {
    r = 0; g = c; b = x;
  } else if (180 <= h && h < 240) {
    r = 0; g = x; b = c;
  } else if (240 <= h && h < 300) {
    r = x; g = 0; b = c;
  } else if (300 <= h && h < 360) {
    r = c; g = 0; b = x;
  }

  const toHex = (n: number) => {
    const hex = Math.round((n + m) * 255).toString(16);
    return hex.length === 1 ? '0' + hex : hex;
  };

  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

/**
 * Dims a single hex color for dark mode while retaining its distinctive tint/hue
 */
export function dimHexForDarkMode(hex: string): string {
  const rgb = parseHexColor(hex);
  if (!rgb) return hex;
  const [h, s, l] = rgbToHsl(...rgb);

  // Map lightness to comfortable dark mode background range (12% to 20%) and preserve saturation
  const targetL = Math.max(0.11, Math.min(0.22, 0.12 + l * 0.08));
  const targetS = Math.min(1, Math.max(0.35, s * 1.15));

  return hslToHex(h, targetS, targetL);
}

/**
 * Dims a gradient or color string for dark mode
 */
export function dimColorStringForDarkMode(colorStr: string): string {
  if (!colorStr || typeof colorStr !== 'string') return colorStr;
  const trimmed = colorStr.trim();

  // Replace all hex codes inside the string (works for gradients and single hex colors)
  return trimmed.replace(/#(?:[0-9a-fA-F]{3}){1,2}\b/g, (match) => dimHexForDarkMode(match));
}

/**
 * Generates comprehensive theme tokens for space rendering (supporting soft smooth gradients and solid colors)
 */
export function getSpaceThemeStyles(
  color?: string | null,
  isSystemDark: boolean = false
): SpaceThemeTokens {
  if (!color || typeof color !== 'string' || !color.trim()) {
    if (isSystemDark) {
      return {
        containerBg: '#18181b',
        primaryColor: '#38bdf8',
        isDark: true,
        textColor: '#f8fafc',
        subtextColor: '#94a3b8',
        badgeBg: 'rgba(255, 255, 255, 0.08)',
        badgeText: '#f1f5f9',
        inputBg: 'rgba(255, 255, 255, 0.06)',
        inputPlaceholder: '#71717a',
        actionHoverBg: 'rgba(255, 255, 255, 0.08)',
        borderColor: 'rgba(255, 255, 255, 0.1)',
        cardBorder: '1px solid rgba(255, 255, 255, 0.1)',
        cardBoxShadow: '0 2px 8px rgba(0, 0, 0, 0.3), 0 8px 20px rgba(0, 0, 0, 0.2)',
        shelfBg: 'rgba(0, 0, 0, 0.25)',
      };
    }

    return {
      containerBg: '#ffffff',
      primaryColor: '#3b82f6',
      isDark: false,
      textColor: '#0f172a',
      subtextColor: '#64748b',
      badgeBg: '#f1f5f9',
      badgeText: '#475569',
      inputBg: '#f8fafc',
      inputPlaceholder: '#94a3b8',
      actionHoverBg: '#f1f5f9',
      borderColor: '#e2e8f0',
      cardBorder: '1px solid #e2e8f0',
      cardBoxShadow: '0 2px 8px rgba(0, 0, 0, 0.04), 0 8px 20px rgba(0, 0, 0, 0.03)',
      shelfBg: '#f8fafc',
    };
  }

  const trimmed = color.trim();
  let baseStyles: SpaceThemeTokens;

  // 1. Check exact preset gradient
  const matchedGradient = PRESET_GRADIENTS.find((g) => g.value === trimmed || g.id === trimmed);
  if (matchedGradient) {
    baseStyles = {
      containerBg: matchedGradient.value,
      primaryColor: matchedGradient.primary,
      ...matchedGradient.tokens,
    };
  } else if (trimmed.includes('gradient')) {
    // 2. Check custom gradient string
    const primary = getSpacePrimaryColor(trimmed);
    const isDark = isDarkColor(primary);
    baseStyles = {
      containerBg: trimmed,
      primaryColor: primary,
      isDark,
      textColor: isDark ? '#ffffff' : '#191c1b',
      subtextColor: isDark ? 'rgba(255, 255, 255, 0.75)' : 'rgba(25, 28, 27, 0.75)',
      badgeBg: isDark ? 'rgba(255, 255, 255, 0.25)' : 'rgba(255, 255, 255, 0.45)',
      badgeText: isDark ? '#ffffff' : '#191c1b',
      inputBg: isDark ? 'rgba(255, 255, 255, 0.2)' : 'rgba(255, 255, 255, 0.38)',
      inputPlaceholder: isDark ? 'rgba(255, 255, 255, 0.65)' : 'rgba(25, 28, 27, 0.58)',
      actionHoverBg: isDark ? 'rgba(255, 255, 255, 0.22)' : 'rgba(255, 255, 255, 0.4)',
      borderColor: isDark ? 'rgba(255, 255, 255, 0.18)' : 'rgba(25, 28, 27, 0.14)',
      cardBorder: 'none',
      cardBoxShadow: isDark
        ? 'inset 0 0 0 1px rgba(255, 255, 255, 0.15), 0 4px 20px rgba(0, 0, 0, 0.25), 0 1px 3px rgba(0, 0, 0, 0.15)'
        : 'inset 0 0 0 1px rgba(255, 255, 255, 0.45), inset 0 1px 0 rgba(255, 255, 255, 0.35), 0 4px 16px rgba(0, 0, 0, 0.04), 0 1px 3px rgba(0, 0, 0, 0.02)',
      shelfBg: isDark ? 'rgba(255, 255, 255, 0.16)' : 'rgba(255, 255, 255, 0.3)',
    };
  } else {
    // 3. Check known solid presets or custom solid hex
    const lower = trimmed.toLowerCase();
    if (SOLID_PALETTE_MAP[lower]) {
      const preset = SOLID_PALETTE_MAP[lower];
      baseStyles = {
        containerBg: trimmed,
        primaryColor: preset.primary,
        ...preset.tokens,
      };
    } else {
      const isDark = isDarkColor(trimmed);
      baseStyles = {
        containerBg: trimmed,
        primaryColor: trimmed,
        isDark,
        textColor: isDark ? '#ffffff' : '#191c1b',
        subtextColor: isDark ? 'rgba(255, 255, 255, 0.75)' : 'rgba(25, 28, 27, 0.75)',
        badgeBg: isDark ? 'rgba(255, 255, 255, 0.22)' : 'rgba(0, 0, 0, 0.08)',
        badgeText: isDark ? '#ffffff' : '#191c1b',
        inputBg: isDark ? 'rgba(255, 255, 255, 0.16)' : 'rgba(0, 0, 0, 0.05)',
        inputPlaceholder: isDark ? 'rgba(255, 255, 255, 0.65)' : 'rgba(0, 0, 0, 0.55)',
        actionHoverBg: isDark ? 'rgba(255, 255, 255, 0.18)' : 'rgba(0, 0, 0, 0.08)',
        borderColor: isDark ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.08)',
        cardBorder: 'none',
        cardBoxShadow: isDark
          ? 'inset 0 0 0 1px rgba(255, 255, 255, 0.15), 0 4px 20px rgba(0, 0, 0, 0.25), 0 1px 3px rgba(0, 0, 0, 0.15)'
          : 'inset 0 0 0 1px rgba(255, 255, 255, 0.45), inset 0 1px 0 rgba(255, 255, 255, 0.35), 0 4px 16px rgba(0, 0, 0, 0.04), 0 1px 3px rgba(0, 0, 0, 0.02)',
        shelfBg: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.04)',
      };
    }
  }

  // When in dark mode, dim the brightness of the space theme color/gradient
  if (isSystemDark) {
    return {
      ...baseStyles,
      containerBg: dimColorStringForDarkMode(baseStyles.containerBg),
      isDark: true,
      textColor: '#ffffff',
      subtextColor: 'rgba(255, 255, 255, 0.75)',
      badgeBg: 'rgba(255, 255, 255, 0.16)',
      badgeText: '#ffffff',
      inputBg: 'rgba(255, 255, 255, 0.12)',
      inputPlaceholder: 'rgba(255, 255, 255, 0.6)',
      actionHoverBg: 'rgba(255, 255, 255, 0.18)',
      borderColor: 'rgba(255, 255, 255, 0.14)',
      cardBorder: 'none',
      cardBoxShadow: 'inset 0 0 0 1px rgba(255, 255, 255, 0.12), 0 4px 20px rgba(0, 0, 0, 0.25), 0 1px 3px rgba(0, 0, 0, 0.15)',
      shelfBg: 'rgba(255, 255, 255, 0.12)',
    };
  }

  return baseStyles;
}
