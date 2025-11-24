/**
 * Password store that persists for 1 day using localStorage.
 * This allows the wallet password to be reused after unlock without
 * requiring the user to re-enter it for each transaction, even after page refresh.
 */

const STORAGE_KEY = 'wallet_password';
const EXPIRATION_KEY = 'wallet_password_expires';
const ONE_DAY_MS = 24 * 60 * 60 * 1000; // 24 hours in milliseconds

/**
 * Store the wallet password with 1-day expiration
 */
export const setWalletPassword = (password: string): void => {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    const expiresAt = Date.now() + ONE_DAY_MS;
    // Store password and expiration timestamp
    localStorage.setItem(STORAGE_KEY, password);
    localStorage.setItem(EXPIRATION_KEY, expiresAt.toString());
  } catch (error) {
    console.error('Failed to store wallet password:', error);
  }
};

/**
 * Get the stored wallet password if it hasn't expired
 */
export const getWalletPassword = (): string | null => {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const password = localStorage.getItem(STORAGE_KEY);
    const expiresAtStr = localStorage.getItem(EXPIRATION_KEY);

    if (!password || !expiresAtStr) {
      return null;
    }

    const expiresAt = parseInt(expiresAtStr, 10);

    // Check if password has expired
    if (Date.now() > expiresAt) {
      // Password expired, clear it
      clearWalletPassword();
      return null;
    }

    return password;
  } catch (error) {
    console.error('Failed to retrieve wallet password:', error);
    return null;
  }
};

/**
 * Clear the stored wallet password
 */
export const clearWalletPassword = (): void => {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(EXPIRATION_KEY);
  } catch (error) {
    console.error('Failed to clear wallet password:', error);
  }
};

/**
 * Check if wallet is currently unlocked (has valid password stored)
 */
export const isWalletUnlocked = (): boolean => {
  return getWalletPassword() !== null;
};
