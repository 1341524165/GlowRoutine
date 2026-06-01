## ADDED Requirements

### Requirement: Daily check-in log
The system SHALL support a quick 30-second daily log tracking skin rating (oiliness, redness, acne), sleep duration, lifestyle triggers (staying up late, hotpot, period), and uploading a raw selfie.

#### Scenario: Submitting daily log
- **WHEN** the user fills out the check-in form and submits it
- **THEN** the system SHALL record the data in the skin_diary database

### Requirement: Visual comparison slider
The system SHALL provide a side-by-side interactive image comparison tool showing two skin photos from different dates.

#### Scenario: Sliding divider between before and after
- **WHEN** the user opens the Photo Diary comparison page
- **THEN** the system SHALL render a vertical slider allowing the user to drag a dividing line to seamlessly compare a baseline skin photo with today's photo

### Requirement: Weekly trend AI report
The system SHALL compile 5-7 days of daily diary logs and products used, and use an LLM to generate a trend analysis and personalized skincare advice.

#### Scenario: Generate weekly report via ad or subscription
- **WHEN** a user triggers the Weekly Report after completing 5 daily check-ins
- **THEN** the system SHALL execute the LLM report generation once the user either has a premium subscription or completes watching a rewarded video ad
