export const AuthErrors = {
  AUTH_INVALID_CREDENTIALS: 'AUTH_INVALID_CREDENTIALS',
  AUTH_NO_SESSION: 'AUTH_NO_SESSION',
  AUTH_SESSION_EXPIRED: 'AUTH_SESSION_EXPIRED',
  AUTH_TOKEN_INVALID: 'AUTH_TOKEN_INVALID',
  AUTH_EMAIL_EXISTS: 'AUTH_EMAIL_EXISTS',
  FORBIDDEN_NO_ROLE: 'FORBIDDEN_NO_ROLE',
  AUTH_ROUTE_DENIED: 'AUTH_ROUTE_DENIED',
} as const;

export type AuthErrorCode = typeof AuthErrors[keyof typeof AuthErrors];

export function isAuthErrorCode(code: string): code is AuthErrorCode {
  return Object.values(AuthErrors).includes(code as AuthErrorCode);
}
