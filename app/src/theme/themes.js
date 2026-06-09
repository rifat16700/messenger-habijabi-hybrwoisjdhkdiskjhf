// ============================================================
//  Theme System — Light & Dark Mode
//  Messenger/Telegram style dark + WhatsApp style light
// ============================================================

const baseColors = {
  primary: '#6366F1',          // Indigo
  primaryLight: '#818CF8',
  primaryDark: '#4F46E5',
  accent: '#06B6D4',           // Cyan
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
    // Backgrounds
    background: '#0F0F13',
    surface: '#1A1A24',
    surfaceAlt: '#22222E',
    card: '#1E1E2A',
    cardBorder: '#2D2D3F',
    // Bubbles
    myBubble: '#4F46E5',
    theirBubble: '#252533',
    myBubbleText: '#FFFFFF',
    theirBubbleText: '#E2E8F0',
    // Text
    text: '#F1F5F9',
    textSecondary: '#94A3B8',
    textMuted: '#64748B',
    textOnPrimary: '#FFFFFF',
    // Input
    inputBg: '#252533',
    inputBorder: '#3D3D52',
    inputText: '#F1F5F9',
    placeholder: '#64748B',
    // Header/Tab
    headerBg: '#12121A',
    headerBorder: '#2D2D3F',
    tabBg: '#12121A',
    tabActive: '#6366F1',
    tabInactive: '#64748B',
    // Status bar
    statusBar: 'light-content',
    // Divider
    divider: '#2D2D3F',
    // Modal
    modalBg: '#1A1A24',
    overlay: 'rgba(0,0,0,0.7)',
    // Badge
    badgeBg: '#252533',
    // Shadow
    shadow: '#000000',
    // Call screen
    callBg: '#0F0F13',
    callControls: 'rgba(30,30,42,0.9)',
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
    // Backgrounds
    background: '#F8FAFC',
    surface: '#FFFFFF',
    surfaceAlt: '#F1F5F9',
    card: '#FFFFFF',
    cardBorder: '#E2E8F0',
    // Bubbles
    myBubble: '#6366F1',
    theirBubble: '#FFFFFF',
    myBubbleText: '#FFFFFF',
    theirBubbleText: '#1E293B',
    // Text
    text: '#1E293B',
    textSecondary: '#64748B',
    textMuted: '#94A3B8',
    textOnPrimary: '#FFFFFF',
    // Input
    inputBg: '#F1F5F9',
    inputBorder: '#E2E8F0',
    inputText: '#1E293B',
    placeholder: '#94A3B8',
    // Header/Tab
    headerBg: '#FFFFFF',
    headerBorder: '#E2E8F0',
    tabBg: '#FFFFFF',
    tabActive: '#6366F1',
    tabInactive: '#94A3B8',
    // Status bar
    statusBar: 'dark-content',
    // Divider
    divider: '#E2E8F0',
    // Modal
    modalBg: '#FFFFFF',
    overlay: 'rgba(0,0,0,0.5)',
    // Badge
    badgeBg: '#F1F5F9',
    // Shadow
    shadow: '#000000',
    // Call screen
    callBg: '#1E293B',
    callControls: 'rgba(255,255,255,0.1)',
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
