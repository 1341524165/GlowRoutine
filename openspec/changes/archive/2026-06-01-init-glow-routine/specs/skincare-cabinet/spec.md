## ADDED Requirements

### Requirement: Product cabinet shelves
The system SHALL classify and organize owned products into visual categories (Cleanser, Toner, Essence, Cream, Active/Retinol/Acids, Sunscreen).

#### Scenario: Display shelf categories
- **WHEN** the user opens the Skincare Cabinet page
- **THEN** the system SHALL display products grouped by their category with PAO (Period After Opening) progress bars (green, yellow, red) indicating shelf life safety

### Requirement: Product manual entry
The system SHALL allow users to manually add products to the cabinet by choosing category, active ingredients, opening date, and PAO months.

#### Scenario: Add product manually
- **WHEN** the user completes the manual input form and clicks save
- **THEN** the system SHALL create a product record in the database with the core ingredient tags

### Requirement: Photo-scan product entry
The system SHALL allow premium subscribers to scan the product bottle/label using photo upload to extract active ingredients and PAO months.

#### Scenario: Parse product from photo
- **WHEN** the subscriber uploads a photo of the product container
- **THEN** the system SHALL invoke OCR and a lightweight LLM to parse and automatically save the product with matching ingredient tags and PAO data
