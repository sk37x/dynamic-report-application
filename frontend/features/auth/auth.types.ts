export type AuthUser = {
    id: string;
    username: string;
    displayName: string;
    roles: string[];
    permissions: string[];
}

export type LoginInput = {
    username: string;
    password: string;
}

export type AuthSession = 
  | { status: "disabled"; user: null }
  | { status: "loading"; user: null }
  | { status: "authenticated"; user: AuthUser }
  | { status: "unauthenticated"; user: null }
  | { status: "error"; user: null; message: string };