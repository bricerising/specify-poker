import { createPinoLogger } from '@specify-poker/shared';
import { getConfig } from '../config';

const logger = createPinoLogger({ level: getConfig().logLevel });

export default logger;
