# Security Specification — AI Home Brain

## 1. Data Invariants
1. A `UserProfile` at `/users/{userId}` can only be read (`get`) or written by the authenticated user whose `request.auth.uid == userId`. Listing `/users` is strictly denied to isolate PII (`email`).
2. Every write requires `request.auth.token.email_verified == true`.
3. `HomeState` at `/users/{userId}/homeState/default` and `ActivityEntry` at `/users/{userId}/activities/{activityId}` require the parent `/users/{userId}` document to exist (`Master Gate`), and `ownerId` must equal `request.auth.uid`.
4. Immutable fields (`uid`, `ownerId`, `createdAt`) cannot be modified on update.
5. `createdAt` and `updatedAt` must equal `request.time` (server timestamps).
6. `fanSpeed` is strictly an integer between `1` and `5`.
7. `selectedMode` is restricted to `['Home', 'Away', 'Sleep', 'Morning']`.
8. Document IDs are hardened via `isValidId(id)` (`^[a-zA-Z0-9_-]+$`, `<= 128` chars) and all strings enforce explicit `.size()` upper bounds.

## 2. The "Dirty Dozen" Payloads (Expected: PERMISSION_DENIED)
1. **Unauthenticated read**: `get /users/user1` with `auth == null`.
2. **Cross-user PII read**: `get /users/user2` authenticated as `user1`.
3. **Blanket user list**: `list /users` authenticated as `user1`.
4. **Unverified email write**: `create /users/user1` with `email_verified: false`.
5. **Identity spoofing**: `create /users/user1` with `uid: "user2"`.
6. **Shadow field injection**: `create /users/user1` with extra `isAdmin: true`.
7. **Oversized displayName**: `create /users/user1` with `displayName` > 100 chars.
8. **Client-forged timestamp**: `create /users/user1` with `createdAt` != `request.time`.
9. **Orphaned HomeState**: `create /users/user1/homeState/default` when `/users/user1` does not exist.
10. **Invalid fanSpeed**: `update /users/user1/homeState/default` with `fanSpeed: 99`.
11. **Invalid selectedMode**: `update /users/user1/homeState/default` with `selectedMode: "AdminOverride"`.
12. **Immutable ownerId tampering**: `update /users/user1/homeState/default` changing `ownerId`.
