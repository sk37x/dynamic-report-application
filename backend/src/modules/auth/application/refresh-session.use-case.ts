import type { AuthUser } from '../domain/auth-user';
import { InvalidSessionError } from '../domain/invalid-session.error';

import type {
  IssuedSession,
  RefreshTokenVerifier,
  SessionRefresher,
} from './auth.ports';
import type { AuthIdentityReader } from './user-identity.ports';

export interface RefreshSessionResult {
  user: AuthUser;
  session: IssuedSession;
}

type RefreshSessionService =
  & RefreshTokenVerifier
  & SessionRefresher;

export class RefreshSessionUseCase {
  constructor(
    private readonly sessions: RefreshSessionService,
    private readonly identities: AuthIdentityReader,
  ) {}

  async execute(
    refreshToken: string,
  ): Promise<RefreshSessionResult> {
    if (!refreshToken) {
      throw new InvalidSessionError();
    }

    const verified =
      await this.sessions.verifyRefresh(refreshToken);

    const identity =
      await this.identities.findById(verified.userId);

    if (
      !identity ||
      !identity.isActive ||
      identity.id !== verified.userId
    ) {
      throw new InvalidSessionError();
    }

    const user: AuthUser = {
      id: identity.id,
      username: identity.username,
      displayName: identity.displayName,
      roles: [...identity.roles],
      permissions: [...identity.permissions],
    };

    // refresh() ต้องตรวจ session และ rotate แบบ atomic ตามของเดิม
    const session =
      await this.sessions.refresh(refreshToken);

    return {
      user,
      session,
    };
  }
}