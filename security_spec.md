# NEX AI Security Specification (Phase 0: Payload-First Security TDD)

## 1. Data Invariants

1. **Default-Deny Catch-All**: Every path not explicitly matched in `firestore.rules` is unconditionally denied (`allow read, write: if false;`).
2. **Verified Identity & Ownership**: All reads and writes to `/users/{userId}`, `/familyMembers/{memberId}`, `/emergencyContacts/{contactId}`, `/sosEvents/{eventId}`, and `/activityLogs/{logId}` require an authenticated user (`request.auth != null`) with a verified email (`request.auth.token.email_verified == true`), and strict ownership matching (`uid == request.auth.uid` or `ownerId == request.auth.uid`).
3. **Path Variable Hardening**: Every single-document operation (`get`, `create`, `update`, `delete`) validates the document ID with `isValidId(id)` (`id is string && id.size() >= 1 && id.size() <= 128 && id.matches('^[a-zA-Z0-9_\\-]+$')`).
4. **Strict Key Allowlisting & Anti-Shadow-Update**: Every `isValid[Entity]` helper enforces `data.keys().hasAll([...]) && data.keys().hasOnly([...])` and every `allow update` begins with `isValid[Entity](incoming())` and uses `incoming().diff(existing()).affectedKeys().hasOnly([...])`.
5. **Immutable Ownership & Creation Timestamps**: `ownerId` (or `uid`) and `createdAt` can never be mutated during updates (`incoming().ownerId == existing().ownerId && incoming().createdAt == existing().createdAt`).
6. **Temporal Integrity**: On `create`, `createdAt == request.time` (and `updatedAt == request.time` where present). On `update`, `updatedAt == request.time`.
7. **Terminal State Locking**: An `SosEvent` with `existing().status in ['resolved', 'cancelled']` is in a terminal state and cannot be updated further.
8. **Secure List Queries & PII Protection**: Every `allow list` rule enforces `resource.data.ownerId == request.auth.uid` without `get()`/`exists()` inside `list`.

## 2. The "Dirty Dozen" Payloads

1. **Payload 1 (Unauthenticated Write)**: `auth = null`, creating `/users/user_1`. Expected: `PERMISSION_DENIED`.
2. **Payload 2 (Unverified Email Spoof)**: `auth = { uid: 'user_1', email_verified: false }`, creating `/users/user_1`. Expected: `PERMISSION_DENIED`.
3. **Payload 3 (Cross-User Identity Spoofing)**: `auth = { uid: 'attacker_1', email_verified: true }`, creating `/familyMembers/fam_1` with `ownerId: 'victim_1'`. Expected: `PERMISSION_DENIED`.
4. **Payload 4 (Shadow / Ghost Field Injection on Create)**: Creating `/emergencyContacts/ec_1` with an extra field `isAdmin: true`. Expected: `PERMISSION_DENIED`.
5. **Payload 5 (Shadow Field Injection on Update)**: Updating `/users/user_1` with an undeclared key `role: 'superadmin'`. Expected: `PERMISSION_DENIED`.
6. **Payload 6 (Path ID Poisoning)**: Creating `/familyMembers/invalid$id!@#` with non-alphanumeric characters. Expected: `PERMISSION_DENIED`.
7. **Payload 7 (Denial-of-Wallet Oversized String)**: Creating `/activityLogs/log_1` with `responseSummary` length > 600 chars. Expected: `PERMISSION_DENIED`.
8. **Payload 8 (Immutable Field Mutation)**: Updating `/familyMembers/fam_1` to change `ownerId` or `createdAt`. Expected: `PERMISSION_DENIED`.
9. **Payload 9 (Forged Client Timestamp)**: Creating `/sosEvents/sos_1` where `createdAt` does not equal `request.time`. Expected: `PERMISSION_DENIED`.
10. **Payload 10 (Terminal State Bypass on SosEvent)**: Updating `/sosEvents/sos_1` when `existing().status == 'resolved'` back to `'active'`. Expected: `PERMISSION_DENIED`.
11. **Payload 11 (Cross-User PII Read on FamilyMember)**: `auth = { uid: 'user_2', email_verified: true }` attempting `get` on `/familyMembers/fam_owned_by_user_1`. Expected: `PERMISSION_DENIED`.
12. **Payload 12 (Unscoped List Query Scraping)**: `auth = { uid: 'user_2', email_verified: true }` attempting `list` on `/emergencyContacts` without `where('ownerId', '==', 'user_2')`. Expected: `PERMISSION_DENIED`.
