import {
  readFileSync,
  writeFileSync,
  existsSync,
  unlinkSync,
  mkdirSync,
} from "fs";
import { join, dirname } from "path";
import { encryptCredential, decryptCredential } from "./lib/credential-store";

export interface AuthUser {
  id: string;
  email: string;
  name: string | null;
  imageUrl: string | null;
  username: string | null;
}

export interface AuthData {
  token: string;
  refreshToken: string;
  expiresAt: string;
  user: AuthUser;
}

/**
 * Storage for desktop authentication tokens.
 *
 * Writes base64-encoded ciphertext (via credential-store.ts) to auth.dat.
 * Throws CredentialStorageRefusedError on Tier 3 systems instead of
 * silently storing unencrypted data.
 */
export class AuthStore {
  private filePath: string;

  constructor(userDataPath: string) {
    this.filePath = join(userDataPath, "auth.dat");
  }

  /**
   * Save authentication data (encrypted via credential-store.ts).
   * Throws CredentialStorageRefusedError if encryption is unavailable.
   */
  save(data: AuthData): void {
    const dir = dirname(this.filePath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    const jsonData = JSON.stringify(data);
    const encrypted = encryptCredential(jsonData);
    writeFileSync(this.filePath, encrypted, "utf-8");
  }

  /**
   * Load authentication data (decrypts via credential-store.ts).
   */
  load(): AuthData | null {
    try {
      if (!existsSync(this.filePath)) return null;
      const content = readFileSync(this.filePath, "utf-8");
      const decrypted = decryptCredential(content);
      return JSON.parse(decrypted);
    } catch {
      console.error("Failed to load auth data");
      return null;
    }
  }

  /**
   * Clear stored authentication data.
   */
  clear(): void {
    try {
      if (existsSync(this.filePath)) {
        unlinkSync(this.filePath);
      }
    } catch (error) {
      console.error("Failed to clear auth data:", error);
    }
  }

  isAuthenticated(): boolean {
    const data = this.load();
    if (!data) return false;
    const expiresAt = new Date(data.expiresAt).getTime();
    return expiresAt > Date.now();
  }

  getUser(): AuthUser | null {
    const data = this.load();
    return data?.user ?? null;
  }

  getToken(): string | null {
    const data = this.load();
    if (!data) return null;
    const expiresAt = new Date(data.expiresAt).getTime();
    if (expiresAt <= Date.now()) return null;
    return data.token;
  }

  getRefreshToken(): string | null {
    const data = this.load();
    return data?.refreshToken ?? null;
  }

  needsRefresh(): boolean {
    const data = this.load();
    if (!data) return false;
    const expiresAt = new Date(data.expiresAt).getTime();
    const fiveMinutes = 5 * 60 * 1000;
    return expiresAt - Date.now() < fiveMinutes;
  }

  updateUser(updates: Partial<AuthUser>): AuthUser | null {
    const data = this.load();
    if (!data) return null;
    data.user = { ...data.user, ...updates };
    this.save(data);
    return data.user;
  }
}
