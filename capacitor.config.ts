import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.flowtv.player',
  appName: 'FLOW TV',
  webDir: 'dist/client',
  server: {
    androidScheme: 'https',
    cleartext: true
  },
  plugins: {
    CapacitorHttp: {
      enabled: true
    },
    CapacitorVideoPlayer: {
      chromeBypass: true
    }
  }
};

export default config;
