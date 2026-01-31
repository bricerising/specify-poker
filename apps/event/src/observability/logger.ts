import { createPinoLogger } from '@specify-poker/shared';
import { getConfig } from '../config';

const logger = createPinoLogger({
  level: process.env.NODE_ENV === 'test' ? 'silent' : getConfig().logLevel,
});

export default logger;
