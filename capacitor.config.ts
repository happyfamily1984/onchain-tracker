import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.happyfamily.onchaintracker',
  appName: '코인 고래 레이더',
  webDir: 'dist',
  backgroundColor: '#0b0e14',
  plugins: {
    SystemBars: { insetsHandling: 'css', style: 'DARK', initialViewportFitValueHint: 'cover' },
  },
  android: {
    allowMixedContent: false,
  },
}

export default config
