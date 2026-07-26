/**
 * The slice of the expo-sqlite surface this app uses.
 *
 * Declaring it as an interface rather than importing SQLiteDatabase everywhere
 * keeps the repository testable against Node's SQLite, so query logic is
 * covered without a device or a native module.
 */

export type SqlValue = string | number | null;

/**
 * Params are required rather than optional, including for statements that take
 * none. expo-sqlite reserves the no-argument form for a variadic overload, and
 * an optional array does not match it.
 */
export type Sql = {
  execAsync(sql: string): Promise<void>;
  runAsync(sql: string, params: SqlValue[]): Promise<{ changes: number }>;
  getFirstAsync<T>(sql: string, params: SqlValue[]): Promise<T | null>;
  getAllAsync<T>(sql: string, params: SqlValue[]): Promise<T[]>;
  withTransactionAsync(work: () => Promise<void>): Promise<void>;
};
