// ============================================================
//  Theme System — Light & Dark Mode
//  Messenger/Telegram style dark + WhatsApp style light
// ============================================================

const baseColors = {
  primary: '#800000',          // Red Maroon
  primaryLight: '#B03030',
  primaryDark: '#5C0000',      // Dark Maroon
  accent: '#D4AF37',           // Gold/Accent
  success: '#10B981',
  warning: '#F59E0B',
  error: '#EF4444',
  online: '#22C55E',
  offline: '#94A3B8',
};

export const darkTheme = {
  mode: 'dark',
  colors: {
    ...baseColors,
    // Backgrounds (5% maroon, 40% light, rest dark -> Dark Grayish Maroon)
    background: '#1F1416',
    surface: '#2C1A1D',
    surfaceAlt: '#362226',
    card: '#241618',
    cardBorder: '#3D2529',
    // Bubbles
    myBubble: '#5C0000', // Dark Maroon
    theirBubble: '#362226',
    myBubbleText: '#FFFFFF',
    theirBubbleText: '#F1F5F9',
    // Text
    text: '#F8ECEC',
    textSecondary: '#B39D9D',
    textMuted: '#806969',
    textOnPrimary: '#FFFFFF',
    // Input
    inputBg: '#2C1A1D',
    inputBorder: '#4A2D32',
    inputText: '#F8ECEC',
    placeholder: '#806969',
    // Header/Tab
    headerBg: '#170E0F',
    headerBorder: '#3D2529',
    tabBg: '#170E0F',
    tabActive: '#A32929',
    tabInactive: '#806969',
    // Status bar
    statusBar: 'light-content',
    // Divider
    divider: '#3D2529',
    // Modal
    modalBg: '#2C1A1D',
    overlay: 'rgba(0,0,0,0.75)',
    // Badge
    badgeBg: '#362226',
    // Shadow
    shadow: '#000000',
    // Call screen
    callBg: '#170E0F',
    callControls: 'rgba(44,26,29,0.9)',
  },
  spacing: {
    xs: 4,
    sm: 8,
    md: 12,
    lg: 16,
    xl: 24,
    xxl: 32,
    xxxl: 48,
  },
  borderRadius: {
    sm: 8,
    md: 12,
    lg: 16,
    xl: 24,
    full: 999,
  },
  typography: {
    fontFamily: 'System',
    h1: { fontSize: 28, fontWeight: '700', letterSpacing: -0.5 },
    h2: { fontSize: 22, fontWeight: '700', letterSpacing: -0.3 },
    h3: { fontSize: 18, fontWeight: '600' },
    h4: { fontSize: 16, fontWeight: '600' },
    body: { fontSize: 15, fontWeight: '400' },
    bodySmall: { fontSize: 13, fontWeight: '400' },
    caption: { fontSize: 11, fontWeight: '400' },
    button: { fontSize: 15, fontWeight: '600' },
  },
};

export const lightTheme = {
  mode: 'light',
  colors: {
    ...baseColors,
    // Backgrounds (Thick boiled milk color)
    background: '#FFF8ED',
    surface: '#FFFFFF',
    surfaceAlt: '#FFF0D9',
    card: '#FFFFFF',
    cardBorder: '#F2DFCB',
    // Bubbles
    myBubble: '#800000', // Red Maroon
    theirBubble: '#FFFFFF',
    myBubbleText: '#FFFFFF',
    theirBubbleText: '#3B2929',
    // Text
    text: '#2B1A1A',
    textSecondary: '#7A6262',
    textMuted: '#A89494',
    textOnPrimary: '#FFFFFF',
    // Input
    inputBg: '#FFFFFF',
    inputBorder: '#E6D3C1',
    inputText: '#2B1A1A',
    placeholder: '#A89494',
    // Header/Tab
    headerBg: '#FFF8ED',
    headerBorder: '#F2DFCB',
    tabBg: '#FFF8ED',
    tabActive: '#800000',
    tabInactive: '#A89494',
    // Status bar
    statusBar: 'dark-content',
    // Divider
    divider: '#F2DFCB',
    // Modal
    modalBg: '#FFFFFF',
    overlay: 'rgba(43,26,26,0.4)',
    // Badge
    badgeBg: '#FFF0D9',
    // Shadow
    shadow: '#3D2525',
    // Call screen
    callBg: '#2B1A1A',
    callControls: 'rgba(255,248,237,0.1)',
  },
  spacing: {
    xs: 4,
    sm: 8,
    md: 12,
    lg: 16,
    xl: 24,
    xxl: 32,
    xxxl: 48,
  },
  borderRadius: {
    sm: 8,
    md: 12,
    lg: 16,
    xl: 24,
    full: 999,
  },
  typography: {
    fontFamily: 'System',
    h1: { fontSize: 28, fontWeight: '700', letterSpacing: -0.5 },
    h2: { fontSize: 22, fontWeight: '700', letterSpacing: -0.3 },
    h3: { fontSize: 18, fontWeight: '600' },
    h4: { fontSize: 16, fontWeight: '600' },
    body: { fontSize: 15, fontWeight: '400' },
    bodySmall: { fontSize: 13, fontWeight: '400' },
    caption: { fontSize: 11, fontWeight: '400' },
    button: { fontSize: 15, fontWeight: '600' },
  },
};
