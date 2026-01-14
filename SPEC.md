# Expense Management Platform Specification

## Overview
An expense management platform where users upload receipts that are scanned, categorized, and added to their expense records. The system streamlines capture, review, and reporting of business expenses.

## Goals
- Fast receipt capture from mobile and web.
- High-accuracy OCR and categorization.
- Clear audit trail from receipt to expense entry.
- Simple review and approval workflow.
- Export-ready reporting for accounting.

## Non-Goals
- Full accounting ledger or payroll.
- Corporate card issuing.
- Complex multi-entity tax compliance.

## Personas
- Employee: uploads receipts and manages expenses.
- Finance/Admin: configures categories, policies, and exports.

## Core User Flows
1. Upload receipt (photo/PDF) from mobile or web.
2. OCR extracts merchant, date, amount, taxes, and line items (when possible).
3. Categorization suggests expense category and project/client tags.
4. User reviews and edits fields, then saves expense.
5. Expenses are auto-approved and ready for export.

## Functional Requirements
- Receipt upload (image/PDF) with basic validation (size, format).
- OCR pipeline with confidence scoring and retry on failure.
- Categorization engine with user override and learning from corrections.
- Expense creation with fields: merchant, date, amount, currency, category, VAT number (merchant tax ID), notes, attachment, tags, status.
- Expenses are auto-approved in MVP.
- Search/filter by date, category, merchant, status, amount.
- Export to CSV and JSON.

## Data Model (MVP)
- User: id, name, email, role.
- Receipt: id, userId, fileUrl, status, ocrData, createdAt.
- Expense: id, userId, receiptId, merchant, date, amount, currency, categoryId, vatNumber, tags, notes, status, createdAt, updatedAt.
- Category: id, name, rules, isActive.
- AuditLog: id, actorId, action, entityType, entityId, timestamp, metadata.

## OCR + Categorization
- Use OpenAI vision via hosted API for OCR + field extraction in a single pass.
- Return structured JSON with per-field confidence; include merchant VAT number when present; flag missing/low-confidence fields for user review.
- Categorization is provided by the model from a fixed category list; user edits are stored for future suggestions.

## Permissions
- Employee: create and edit own expenses; view own history.
- Admin: manage categories, policies, exports, and user roles.

## Error Handling
- Upload errors: show actionable validation messages.
- OCR failures: allow manual entry and retry.
- Duplicate detection: warn on similar merchant/date/amount.

## Security & Compliance
- Encrypt files at rest and in transit.
- Role-based access control.
- Audit log for changes and approvals.
- Data retention settings per organization.

## Metrics
- OCR success rate.
- Field accuracy rate.
- Time from upload to export.
- % of expenses auto-categorized.

## MVP Scope
- Single organization support.
- Auto-approved expenses only.
- CSV export only.
- Basic category rules.
- Hosted vision LLM for OCR + extraction + categorization.

## Tech Stack
- Convex (backend and data layer).
- Tailwind CSS v4 (styling).
- shadcn/ui (UI components).

## Default Categories
- Meals & Entertainment
- Travel (Airfare)
- Travel (Lodging)
- Travel (Ground Transport)
- Fuel & Mileage
- Office Supplies
- Software & Subscriptions
- Telecommunications
- Marketing & Advertising
- Professional Services
- Shipping & Postage
- Training & Education
- Equipment & Hardware
- Utilities
- Rent & Facilities
- Taxes & Fees
- Insurance
- Miscellaneous

## Future Enhancements
- Multi-organization support.
- Approval workflows and policies.
- Corporate card imports.
- Mileage tracking.
