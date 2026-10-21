import { InvalidSessionError } from '../domain/invalid-session.error';
import type {
  AccessTokenVerifier,
  RefreshTokenVerifier,
  SessionRevoker,
} from './auth.ports';

export interface LogoutInput {
  accessToken?: string;
  refreshToken?: string;
}

type LogoutSessionService =
  & AccessTokenVerifier
  & RefreshTokenVerifier
  & SessionRevoker;

export class LogoutUseCase {
  constructor(
    private readonly sessions: LogoutSessionService,
  ) {}

  async execute(input: LogoutInput): Promise<void> {
    const sessionIds = new Set<string>();

    if (input.refreshToken) {
      try {
        const verified =
          await this.sessions.verifyRefresh(input.refreshToken);

        sessionIds.add(verified.sessionId);
      } catch (error) {
        if (!(error instanceof InvalidSessionError)) {
          throw error;
        }
      }
    }

    if (input.accessToken) {
      try {
        const verified =
          await this.sessions.verifyAccess(input.accessToken);

        sessionIds.add(verified.sessionId);
      } catch (error) {
        if (!(error instanceof InvalidSessionError)) {
          throw error;
        }
      }
    }

    for (const sessionId of sessionIds) {
      await this.sessions.revokeSession(sessionId);
    }
  }
}