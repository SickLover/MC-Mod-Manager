import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        creeper: {
          DEFAULT: '#5a9e3a',
          light: '#7ec850',
          dark: '#3d6e25',
        },
        surface: {
          DEFAULT: '#1f1f1f',
          alt: '#252525',
          deep: '#1a1a1a',
        },
        border: {
          DEFAULT: '#1f2937',
        },
        // 保留旧命名以兼容已有代码
        mc: {
          green: '#5a9e3a',
          'green-light': '#7ec850',
          'green-dark': '#3d6e25',
          bg: '#1a1a1a',
          card: '#252525',
          'card-hover': '#2a2a2a',
          text: '#e5e5e5',
          muted: '#9ca3af',
        },
      },
      borderRadius: {
        mc: '0.75rem',
      },
      animation: {
        'fade-in': 'fadeIn 0.4s ease forwards',
      },
      keyframes: {
        fadeIn: {
          from: { opacity: '0', transform: 'translateY(8px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
      },
    },
  },
  plugins: [],
};

export default config;
