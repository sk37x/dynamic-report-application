import type { AuthUser } from '../domain/auth-user';
import { InvalidSessionError } from '../domain/invalid-session.error';

import type { AccessTokenVerifier } from './auth.ports';
import type { AuthIdentityReader } from './user-identity.ports';

export type AuthenticatedSession = {
  sessionId: string;
  user: AuthUser;
};

export class AuthenticateSessionUseCase {
  constructor(
    private readonly tokens: AccessTokenVerifier,
    private readonly identities: AuthIdentityReader,
  ) {}

  async execute(
    accessToken: string,
  ): Promise<AuthenticatedSession> {
    const verified = await this.tokens.verifyAccess(accessToken);

    const identity = await this.identities.findById(
      verified.userId,
    );

    if (
      !identity
      || !identity.isActive
      || identity.id !== verified.userId
    ) {
      throw new InvalidSessionError();
    }

    return {
      sessionId: verified.sessionId,

      user: {
        id: identity.id,
        username: identity.username,
        displayName: identity.displayName,
        roles: [...identity.roles],
        permissions: [...identity.permissions],
      },
    };
  }
}