/** Customers Error Codes - CUST-001..005 */

export const CustomerErrors = {
  CUSTOMER_NOT_FOUND: 'CUSTOMER_NOT_FOUND',
  CUSTOMER_HAS_SALES: 'CUSTOMER_HAS_SALES',
  CUSTOMER_INVALID_INPUT: 'CUSTOMER_INVALID_INPUT',
  CUSTOMER_NAME_DUPLICATE: 'CUSTOMER_NAME_DUPLICATE',
  CUSTOMER_FETCH_FAILED: 'CUSTOMER_FETCH_FAILED',
} as const;

export type CustomerErrorCode = (typeof CustomerErrors)[keyof typeof CustomerErrors];
