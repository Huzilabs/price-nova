/**
 * Domain enums.
 *
 * SQLite has no enum type, so these columns are String in the schema. The
 * allowed values live here as TS unions and are enforced by the service layer.
 * When the provider moves to PostgreSQL these become real database enums; the
 * union names are already the enum names, so nothing above this file changes.
 */

export const USER_STATUS = ["ACTIVE", "SUSPENDED", "CLOSED"] as const;
export type UserStatus = (typeof USER_STATUS)[number];

export const ROLE_KEY = [
  "USER", "ADMIN", "SUPER_ADMIN", "FINANCE_ADMIN", "SUPPORT_ADMIN",
] as const;
export type RoleKey = (typeof ROLE_KEY)[number];

export const PLAN_STATUS = ["DRAFT", "ACTIVE", "RETIRED"] as const;
export type PlanStatus = (typeof PLAN_STATUS)[number];

export const PARTICIPATION_STATUS = [
  "PENDING", "ACTIVE", "PRINCIPAL_WITHDRAWN", "CANCELLED",
] as const;
export type ParticipationStatus = (typeof PARTICIPATION_STATUS)[number];

export const PAYMENT_METHOD = [
  "USDT_TRC20", "USDT_BEP20", "EASYPAISA", "JAZZCASH",
] as const;
export type PaymentMethod = (typeof PAYMENT_METHOD)[number];

export const DEPOSIT_STATUS = ["PENDING", "CONFIRMED", "REJECTED"] as const;
export type DepositStatus = (typeof DEPOSIT_STATUS)[number];

export const WITHDRAWAL_STATUS = [
  "REQUESTED", "PENDING_REVIEW", "APPROVED", "PROCESSING", "PAID", "REJECTED",
] as const;
export type WithdrawalStatus = (typeof WITHDRAWAL_STATUS)[number];

/** Which withdrawal-window rule set governs a request. */
export const WITHDRAWAL_SOURCE = [
  "PRINCIPAL", "COMMISSION", "PRIZE", "BUMPER", "ACCRUAL",
] as const;
export type WithdrawalSource = (typeof WITHDRAWAL_SOURCE)[number];

export const LEDGER_ACCOUNT_KIND = [
  "USER_AVAILABLE", "USER_LOCKED", "USER_PENDING",
  "PLATFORM_CASH", "PRIZE_POOL", "COMMISSION_EXPENSE", "DEPOSIT_LIABILITY",
] as const;
export type LedgerAccountKind = (typeof LEDGER_ACCOUNT_KIND)[number];

export const LEDGER_TX_TYPE = [
  "DEPOSIT", "WITHDRAWAL", "REFERRAL_COMMISSION", "LUCKY_DRAW_REWARD",
  "BUMPER_PRIZE", "DAILY_ACCRUAL", "ADJUSTMENT", "REFUND", "FEE",
  "LOCK", "UNLOCK",
] as const;
export type LedgerTxType = (typeof LEDGER_TX_TYPE)[number];

export const DIRECTION = ["DEBIT", "CREDIT"] as const;
export type Direction = (typeof DIRECTION)[number];

/** The draw lifecycle. Transitions are enforced in DrawService. */
export const DRAW_STATUS = [
  "DRAFT", "OPEN", "ENTRY_CLOSED", "READY_FOR_DRAW",
  "WINNER_SELECTED", "PRIZE_ISSUED", "COMPLETED", "CANCELLED",
] as const;
export type DrawStatus = (typeof DRAW_STATUS)[number];

export const DRAW_TRANSITIONS: Record<DrawStatus, readonly DrawStatus[]> = {
  DRAFT: ["OPEN", "CANCELLED"],
  OPEN: ["ENTRY_CLOSED", "CANCELLED"],
  ENTRY_CLOSED: ["READY_FOR_DRAW", "CANCELLED"],
  READY_FOR_DRAW: ["WINNER_SELECTED", "CANCELLED"],
  WINNER_SELECTED: ["PRIZE_ISSUED"],
  PRIZE_ISSUED: ["COMPLETED"],
  COMPLETED: [],
  CANCELLED: [],
};

export const SELECTION_MODE = ["MANUAL", "RANDOM"] as const;
export type SelectionMode = (typeof SELECTION_MODE)[number];

export const PRIZE_TYPE = ["CASH", "PHYSICAL"] as const;
export type PrizeType = (typeof PRIZE_TYPE)[number];

export const PRIZE_STATUS = ["PENDING", "ISSUED", "FULFILLED", "CANCELLED"] as const;
export type PrizeStatus = (typeof PRIZE_STATUS)[number];
