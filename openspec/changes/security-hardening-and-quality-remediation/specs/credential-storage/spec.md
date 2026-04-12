## MODIFIED Requirements

### Requirement: Token caching for legacy auth
The AuthStore legacy authentication path SHALL cache the decrypted token in memory after first read. Subsequent `getValidToken()` calls SHALL return the cached value without re-reading from disk or re-decrypting. The cache SHALL be invalidated when the token is written or the auth session ends.

#### Scenario: Cached token read
- **WHEN** `getValidToken()` is called after an initial successful token read
- **THEN** the token is returned from memory without calling `readFileSync()` or `decryptCredential()`

#### Scenario: Cache invalidation on token write
- **WHEN** a new token is stored via `storeOAuthToken()`
- **THEN** the in-memory cache is updated with the new token value

#### Scenario: Cache cleared on logout
- **WHEN** the user logs out or the auth session ends
- **THEN** the in-memory cache is cleared

#### Scenario: Enterprise mode unaffected
- **WHEN** `enterpriseAuthEnabled` is true
- **THEN** the legacy AuthStore cache is not used (MSAL has its own cache plugin)
