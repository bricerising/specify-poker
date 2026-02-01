import type { Algorithm, JwtPayload } from 'jsonwebtoken';
import jwt from 'jsonwebtoken';
import {
  createJwtTokenVerifier,
} from '@specify-poker/shared';
import { getConfig } from '../config';

export type VerifiedToken = JwtPayload & { sub?: string };

const verifier = createJwtTokenVerifier<VerifiedToken>({
  env: process.env,
  getFallbackHs256Secret: () => getConfig().jwtSecret || null,
  verify: (token, key, options) => {
    const verified = jwt.verify(token, key, {
      algorithms: options.algorithms.map((alg) => alg as Algorithm),
      issuer: options.issuer,
      audience: options.audience,
    });

    if (typeof verified === 'string') {
      throw new Error('jwt.verify returned string payload');
    }

    return verified as VerifiedToken;
  },
});

export async function verifyToken(token: string): Promise<VerifiedToken> {
  return verifier.verifyToken(token);
}
