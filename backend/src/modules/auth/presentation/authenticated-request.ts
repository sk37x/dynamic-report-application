import type { Request } from 'express';

import type {
  AuthenticatedSession,
} from '../application/authenticate-session.use-case';

export type AuthenticatedRequest = Request & {
  auth?: AuthenticatedSession;
};