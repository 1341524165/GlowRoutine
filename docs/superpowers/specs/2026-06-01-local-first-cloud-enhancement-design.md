# GlowRoutine Local-First Cloud Enhancement Design

## 1. Goal

GlowRoutine will move from cloud-development-first storage to a local-first architecture with cloud features as optional enhancements. The product should reduce WeChat Cloud Development cost without making the free experience feel broken or incomplete.

The core direction is:

- Free users can use the daily skincare workflow without login, payment, or cloud availability.
- Cloud capabilities are reserved for features with real cost or long-term user value.
- Thresholds control free cloud usage, while membership unlocks larger cloud capacity, history, sync, and AI usage.

## 2. Product Positioning

The free version is not a trial that blocks core use. It is a complete local skincare routine tool:

- Skin profile
- Skincare cabinet
- Daily routine
- Skin diary text and scores
- Basic local statistics

Cloud features become an enhanced layer:

- Photo cloud storage
- AI OCR
- AI buying consultation
- AI weekly or monthly reports
- Long-term report archive
- Cross-device sync
- More cloud history

Membership should sell preservation, continuity, sync, and higher AI capacity. It should not sell stronger medical claims or more aggressive diagnosis.

## 3. Recommended Architecture

### 3.1 Local Data Layer

Create a unified local data service around `wx.getStorageSync` and `wx.setStorageSync`.

The service owns these keys:

- `skin_profile`
- `skincare_cabinet`
- `skin_diaries`
- `routine_preferences`
- `ai_report_cache`
- `entitlement_state`

Pages should stop reading and writing storage directly over time. They should call the local data service instead. This keeps future migration to a self-hosted API or cloud sync adapter contained inside the data layer.

### 3.2 Cloud Enhancement Layer

Cloud should no longer be required for core data persistence. It should handle enhanced actions:

- Upload diary photos and return cloud file IDs.
- Run AI OCR for skincare products.
- Run AI buying consultation.
- Generate AI weekly and monthly reports.
- Sync full history for eligible users.

Free users can still use some cloud features, but every cloud feature must pass entitlement and threshold checks first.

### 3.3 Entitlement And Threshold Layer

Add a unified rules layer for quotas and membership state. Do not hard-code quotas separately in each page.

Initial threshold examples:

- Free cloud photo retention: keep the latest X photos.
- Free AI OCR: Y uses per month.
- Free buying consultation: Z uses per month.
- Free AI report archive: keep the latest N reports.
- Local diary text: unlimited or very high limit, with storage-warning fallback only.
- Member users: higher or unlimited cloud retention, long-term report archive, cross-device sync, and higher AI quotas.

Threshold outcomes should be grouped into three behavior types:

- Auto-cleanable: old cloud photo copies and old cloud report archives.
- Cloud-limited only: local data remains usable, but new cloud upload or sync pauses.
- Membership-led: cross-device sync, long-term trend review, and full history access.

### 3.4 Membership Prompt Layer

Membership prompts should appear when the user can understand the value.

Prompt levels:

- Near threshold: soft reminder, such as "Cloud photo space is almost full. Older photos will stay local only."
- At threshold: offer clear paths, such as "Keep latest X cloud photos" or "Enable cloud history."
- High-value moments: show membership prompts when the user tries to view older trends, sync another device, export long-term reports, or preserve more AI history.

Prompts should not block routine creation, diary writing, cabinet editing, or daily use.

## 4. Data Flow

Default read flow:

1. Page loads local data first.
2. If the user has cloud entitlement, the app asynchronously fetches cloud data.
3. Cloud data is merged into local storage.
4. The page updates from the merged local state.

Default write flow:

1. User action writes local data first.
2. The app attempts cloud enhancement or sync if eligible.
3. If cloud succeeds, the local item stores cloud metadata such as `cloud_file_id`, `synced_at`, or `report_id`.
4. If cloud fails, the local item remains valid and is marked as pending sync or local-only.

Conflict handling for the first version:

- Every synced entity should have `updated_at`.
- Cloud merge uses latest-write-wins.
- More complex conflict UI can wait until multi-device editing becomes important.

## 5. Feature Behavior

### 5.1 Skin Profile, Cabinet, And Routine

These are core product data and must be local-first.

Free users:

- Can create, edit, and view all core data locally.
- Do not need cloud availability.

Members or sync-enabled users:

- Can sync data after local save.
- Can restore data on another device.

Cloud failure should not show disruptive errors in the main flow. Use subtle sync status in settings or a sync center.

### 5.2 Skin Diary

Diary text, scores, triggers, and product usage should save locally first.

Photo handling uses two layers:

- Local path for immediate display where available.
- Cloud file ID for retained cloud history where eligible.

For free users, when cloud photo retention exceeds the threshold, the system should keep the latest X cloud photos and clean old cloud copies after clear user-facing notice. The app should not promise permanent local photo availability because mini program local file paths may become unavailable.

If photo upload fails, diary save still succeeds and the entry is marked as photo-not-synced.

### 5.3 AI OCR, Buying Consultation, And Reports

These should stay server-side because they need API key protection, output filtering, quota control, and cost management.

Free users receive limited monthly usage. Members receive higher quotas and better archive retention.

Failure fallback:

- Use cached results when available.
- Use rule-generated summaries where possible.
- Show a friendly failure state if no fallback is available.
- Do not render blank pages.

The existing offline fallback direction in `skinDiaryAnalysis` is aligned with this design.

## 6. Privacy And Compliance

Photos and skin diary data are private by default.

AI outputs must continue to avoid medical diagnosis and treatment claims. Safety filtering and disclaimers remain required for both free and member users.

Membership benefits must be framed around:

- Storage
- Sync
- History
- Archive
- AI quota
- Convenience

They must not be framed as more accurate diagnosis or medical-grade advice.

## 7. Migration Plan

### Phase 1: Local-First Refactor

Turn existing local storage fallbacks into the official primary data path:

- Introduce the local data service.
- Move storage reads and writes out of pages gradually.
- Make cloud database writes optional enhancements.
- Preserve existing storage keys to avoid data loss.

### Phase 2: Entitlements And Thresholds

Add the unified quota and membership layer:

- Define free and member quotas.
- Add cloud photo retention cleanup.
- Add AI usage counters.
- Add report archive limits.
- Add membership prompt states.

### Phase 3: Cloud Adapter Or Self-Hosted API

When real demand appears, add a cloud adapter behind the service boundary:

- WeChat cloud adapter for current cloud functions.
- Self-hosted API adapter for future backend migration.
- Shared entitlement checks and sync metadata.

Pages should not need large rewrites during this phase.

## 8. Acceptance Criteria

- Without network or WeChat Cloud Development availability, users can create, edit, and view skin profile, skincare cabinet, daily routine, and diary text.
- Cloud upload failure never loses freshly entered local data.
- Free thresholds clearly distinguish local availability from cloud enhancement limits.
- Membership prompts appear around cloud capacity, sync, history, and AI quota, not basic daily recording.
- AI cloud function failure returns cached, rule-based, or friendly failure states instead of blank UI.
- Existing local cache data remains readable after the refactor.
- Future self-hosted API migration can be implemented by extending service adapters rather than rewriting pages.

## 9. Open Decisions For Implementation

The design intentionally leaves exact quota numbers for implementation planning or product testing:

- Free cloud photo retention count X.
- Monthly free AI OCR count Y.
- Monthly free buying consultation count Z.
- Free AI report archive count N.
- Member quota levels.

These numbers should be chosen conservatively at first and adjusted after observing real usage and cost.
