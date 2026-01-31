import { createPinoLogger } from '@specify-poker/shared';
import { getObservabilityRuntimeConfig } from './runtimeConfig';

const { logLevel } = getObservabilityRuntimeConfig();

const logger = createPinoLogger({ level: logLevel });

export default logger;
