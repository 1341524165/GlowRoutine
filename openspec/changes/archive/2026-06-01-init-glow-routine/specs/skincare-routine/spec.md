## ADDED Requirements

### Requirement: User profile assessment
The system SHALL provide a 2-minute questionnaire to establish the user's skin profile (skin feel, sensitivity, current goal, existing products, budget, city/weather, and period status).

#### Scenario: Successful questionnaire submission
- **WHEN** the user answers all questions and submits the questionnaire
- **THEN** the system SHALL save the profile data to the user database and generate their daily skincare routine

### Requirement: Daily routine generation
The system SHALL generate morning and night skincare routines based on the user's skin profile and active cabinet products using a rule engine.

#### Scenario: Routine auto-mapping with active products
- **WHEN** the user opens the Routine page
- **THEN** the system SHALL display the morning and night steps, auto-filling matching products from their cabinet, and flag any ingredient compatibility warnings (e.g. disable high stimulus acids when skin is sensitive)
