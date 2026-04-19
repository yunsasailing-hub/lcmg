import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.lovable.58a261cc61fa41759ef907a42b409ac1',
  appName: 'lcmg',
  webDir: 'dist',
  server: {
    url: 'https://58a261cc-61fa-4175-9ef9-07a42b409ac1.lovableproject.com?forceHideBadge=true',
    cleartext: true,
  },
  plugins: {
    Filesystem: {
      // Android: writes to /storage/emulated/0/Pictures/LCMG_Checklists/...
      // Files in Pictures/ are auto-indexed by Android MediaStore.
    },
  },
};

export default config;
