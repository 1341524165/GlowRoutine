## ADDED Requirements

### Requirement: Upload种草截图分析
The system SHALL allow users to upload screenshot images or paste note links/texts of cosmetics products for analysis.

#### Scenario: Analyze product screenshot
- **WHEN** the user uploads a screenshot and triggers the AI Buying Consultant
- **THEN** the system SHALL perform OCR to extract the product name, and execute an LLM query using real-time search/knowledge retrieval

### Requirement: Purchase suitability and overlap check
The system SHALL evaluate the identified product against the user's skin profile and current skincare cabinet contents.

#### Scenario: Generate calm-down report
- **WHEN** the LLM finishes retrieving product facts
- **THEN** the system SHALL output a customized "冷静拔草证书" (Calm-down Certificate) detailing suitability score (1-10), marketing hype checks, cabinet product duplication warnings, and a humorous toxic bestie verdict

### Requirement: Shareable card export
The system SHALL support exporting the calm-down report as a beautifully formatted vertical card image.

#### Scenario: Save card to photo album
- **WHEN** the user clicks the "Share / Save Card" button
- **THEN** the system SHALL generate a 9:16 high-quality image card containing the AI review and download it to the user's local photo album
