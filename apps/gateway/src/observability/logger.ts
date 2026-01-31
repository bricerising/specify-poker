import { createPinoLogger } from '@specify-poker/shared';

const logger = createPinoLogger({
  level: process.env.LOG_LEVEL || 'info',
  formatters: {
    level: (label) => {
      return { level: label };
    },
  },
  timestamp: 'isoTime',
});

export default logger;
