import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.jvtech.gefinc',
  appName: 'GEFINC',
  webDir: '../../dist/apps/mobile-app/browser',
  plugins: {
    LocalNotifications: { smallIcon: 'ic_stat_gefinc', iconColor: '#00E599' },
  },
};

export default config;
