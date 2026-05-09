export type ErrorSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export type ErrorAction =
  | 'RETRY'
  | 'LOGIN_AGAIN'
  | 'REFRESH_TOKEN'
  | 'CHECK_CONNECTION'
  | 'CONTACT_SUPPORT'
  | 'CHECK_INPUT'
  | 'OPEN_CASH_BOX'
  | 'CONTACT_ADMIN'
  | 'NONE';

export interface AppErrorDefinition {
  id: string;
  code: string;
  message: string;
  severity: ErrorSeverity;
  recoverable: boolean;
  action: ErrorAction;
  httpStatus?: number;
  module: string;
}
