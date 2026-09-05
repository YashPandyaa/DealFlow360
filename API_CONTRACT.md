# DealFlow360 API Contract

This document specifies the endpoints, request/response payload schemas, status codes, and authorization rules for DealFlow360 backend services.

---

## Authentication Endpoints (`/auth`)

### 1. User Signup
**`POST /auth/signup`**

Creates a new internal or portal user account.

- **Request Headers**: `Content-Type: application/json`
- **Request Body**:
  ```json
  {
    "email": "user@dealflow360.com",
    "password": "securePassword123",
    "name": "Jane Doe",
    "role": "MANAGER"
  }
  ```
  *Allowed roles*: `ADMIN`, `REP`, `MANAGER`, `FINANCE`, `CUSTOMER`

- **Response `201 Created`**:
  ```json
  {
    "user": {
      "id": "c7b3e21a-4d92-4f81-8e01-9a73e4a2bc10",
      "email": "user@dealflow360.com",
      "name": "Jane Doe",
      "role": "MANAGER",
      "isPortalUser": false,
      "createdAt": "2026-09-05T11:00:00.000Z"
    },
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
  ```

- **Error Responses**:
  - `400 Bad Request`: Invalid role value or missing required fields (`email`, `password`, `role`).
    ```json
    { "error": "Invalid role specified" }
    ```
  - `409 Conflict`: Email already exists.
    ```json
    { "error": "Email already in use" }
    ```

---

### 2. User Login
**`POST /auth/login`**

Authenticates an internal or customer user with email and password.

- **Request Headers**: `Content-Type: application/json`
- **Request Body**:
  ```json
  {
    "email": "user@dealflow360.com",
    "password": "securePassword123"
  }
  ```

- **Response `200 OK`**:
  ```json
  {
    "user": {
      "id": "c7b3e21a-4d92-4f81-8e01-9a73e4a2bc10",
      "email": "user@dealflow360.com",
      "name": "Jane Doe",
      "role": "MANAGER",
      "isPortalUser": false
    },
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
  ```
  *(JWT payload contains `{ userId, role }` and expires in 8 hours).*

- **Error Responses**:
  - `401 Unauthorized`: Returned for missing fields, incorrect email, or wrong password (generic message to avoid enumeration).
    ```json
    { "error": "Invalid credentials" }
    ```

---

### 3. Customer Portal Request Magic Link
**`POST /auth/portal/request-link`**

Generates a single-use 15-minute magic link token for customer portal authentication.

- **Request Headers**: `Content-Type: application/json`
- **Request Body**:
  ```json
  {
    "email": "customer@acme.com"
  }
  ```

- **Response `200 OK`**:
  ```json
  {
    "message": "Magic link generated successfully",
    "magicLink": "/auth/portal/verify?token=a8f4c92b...",
    "token": "a8f4c92b..."
  }
  ```

- **Error Responses**:
  - `400 Bad Request`: Missing `email` field.
  - `404 Not Found`: Customer email not found.
    ```json
    { "error": "Customer user not found" }
    ```

---

### 4. Customer Portal Verify Magic Link
**`GET /auth/portal/verify?token=xxx`**

Validates magic link token, marks it as used, and issues a 8-hour JWT token scoped to `role: CUSTOMER`.

- **Query Parameters**: `token` (String, required)

- **Response `200 OK`**:
  ```json
  {
    "user": {
      "id": "e9a2f14b-5c83-4d72-9f01-8b62e3a1cd20",
      "email": "customer@acme.com",
      "name": "Acme Customer",
      "role": "CUSTOMER",
      "isPortalUser": true
    },
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
  ```

- **Error Responses**:
  - `401 Unauthorized`: Token invalid, expired, or already used.
    ```json
    { "error": "Invalid or expired magic link token" }
    ```

---

## Authentication Middleware

### `authenticate`
- Expects header `Authorization: Bearer <jwt_token>`.
- Attaches decoded payload `{ id, role }` to `req.user`.
- **Status Codes**: Returns `401 Unauthorized` if token is missing, invalid, or expired.

### `requireRole(allowedRoles: string[])`
- Checks `req.user.role` against `allowedRoles`.
- **Status Codes**: Returns `403 Forbidden` if role is not permitted (e.g. `CUSTOMER` token accessing internal routes).

---

## Subscription & Hybrid Billing Endpoints (`/subscriptions`, `/orders`)

### 1. Subscription Plans CRUD
**`POST /subscriptions/plans`** *(Admin Only)*

Creates a recurring subscription plan.

- **Headers**: `Authorization: Bearer <ADMIN_JWT>`, `Content-Type: application/json`
- **Request Body**:
  ```json
  {
    "name": "Pro SaaS Monthly",
    "billingCycle": "MONTHLY",
    "productId": "optional-product-uuid",
    "pricePerCycle": 150.00
  }
  ```
  *Allowed `billingCycle` values*: `MONTHLY`, `QUARTERLY`, `YEARLY`

- **Response `201 Created`**:
  ```json
  {
    "id": "7fa12345-6789-4abc-def0-123456789abc",
    "name": "Pro SaaS Monthly",
    "billingCycle": "MONTHLY",
    "productId": "optional-product-uuid",
    "pricePerCycle": 150.00,
    "isActive": true,
    "createdAt": "2026-09-05T11:00:00.000Z",
    "updatedAt": "2026-09-05T11:00:00.000Z"
  }
  ```

- **Related Plan Routes**:
  - `GET /subscriptions/plans` (Lists active plans; `?includeInactive=true` for all)
  - `GET /subscriptions/plans/:id` (Get plan by ID)
  - `PUT /subscriptions/plans/:id` (Update plan, Admin only)
  - `DELETE /subscriptions/plans/:id` (Deactivate plan, Admin only)

---

### 2. Create Subscription
**`POST /subscriptions`**

Creates a subscription and automatically generates the first N (e.g. 12) cycles in `BillingScheduleEntry`.

- **Headers**: `Content-Type: application/json`
- **Request Body**:
  ```json
  {
    "quotationId": "quote-uuid-123",
    "planId": "7fa12345-6789-4abc-def0-123456789abc",
    "quantity": 2,
    "startDate": "2026-01-01T00:00:00.000Z",
    "cyclesToGenerate": 12
  }
  ```

- **Response `201 Created`**:
  ```json
  {
    "id": "sub-uuid-456",
    "quotationId": "quote-uuid-123",
    "planId": "7fa12345-6789-4abc-def0-123456789abc",
    "quantity": 2,
    "startDate": "2026-01-01T00:00:00.000Z",
    "status": "ACTIVE",
    "currentPeriodStart": "2026-01-01T00:00:00.000Z",
    "currentPeriodEnd": "2026-02-01T00:00:00.000Z",
    "billingScheduleEntries": [
      {
        "id": "bse-1",
        "billingDate": "2026-01-01T00:00:00.000Z",
        "amount": 300.00,
        "status": "INVOICED",
        "description": "Billing Cycle 1 (MONTHLY)"
      },
      {
        "id": "bse-2",
        "billingDate": "2026-02-01T00:00:00.000Z",
        "amount": 300.00,
        "status": "UPCOMING",
        "description": "Billing Cycle 2 (MONTHLY)"
      }
    ]
  }
  ```

---

### 3. Update Subscription Quantity with Proration
**`PATCH /subscriptions/:id/quantity`**

Calculates mid-cycle proration when quantity increases or decreases.

- **Proration Formula**:
  $$\text{Prorated Amount} = (\text{newQuantity} - \text{oldQuantity}) \times \text{pricePerUnit} \times \left(\frac{\text{daysRemaining}}{\text{totalDaysInCycle}}\right)$$
  - **Quantity Increase**: Creates immediate `BillingScheduleEntry` with `status: INVOICED` and updates future entries.
  - **Quantity Decrease**: Creates a `CreditNote` for prorated overpayment and updates future entries without producing negative invoices.

- **Headers**: `Content-Type: application/json`
- **Request Body**:
  ```json
  {
    "newQuantity": 4,
    "effectiveDate": "2026-01-11T00:00:00.000Z"
  }
  ```

- **Response `200 OK` (Increase)**:
  ```json
  {
    "subscription": {
      "id": "sub-uuid-456",
      "quantity": 4,
      "status": "ACTIVE"
    },
    "oldQuantity": 2,
    "newQuantity": 4,
    "daysRemaining": 20,
    "totalDaysInCycle": 30,
    "proratedAmount": 200.00,
    "action": "CHARGE",
    "immediateEntry": {
      "id": "entry-prorated-1",
      "billingDate": "2026-01-11T00:00:00.000Z",
      "amount": 200.00,
      "status": "INVOICED",
      "description": "Prorated charge: quantity increased from 2 to 4 (20/30 days remaining)"
    }
  }
  ```

- **Response `200 OK` (Decrease)**:
  ```json
  {
    "subscription": {
      "id": "sub-uuid-456",
      "quantity": 2,
      "status": "ACTIVE"
    },
    "oldQuantity": 4,
    "newQuantity": 2,
    "daysRemaining": 20,
    "totalDaysInCycle": 30,
    "proratedAmount": -200.00,
    "action": "CREDIT",
    "creditNote": {
      "id": "credit-uuid-789",
      "amount": 200.00,
      "reason": "Prorated credit for quantity decrease from 4 to 2 (20/30 days remaining)"
    }
  }
  ```

---

### 4. Cancel Subscription
**`POST /subscriptions/:id/cancel`**

Cancels subscription mid-cycle, calculates refund for unused days, issues `CreditNote`, and voids future scheduled entries.

- **Headers**: `Content-Type: application/json`
- **Request Body**:
  ```json
  {
    "effectiveDate": "2026-01-16T00:00:00.000Z",
    "reason": "Customer migration"
  }
  ```

- **Response `200 OK`**:
  ```json
  {
    "subscription": {
      "id": "sub-uuid-456",
      "status": "CANCELLED"
    },
    "creditNote": {
      "id": "credit-uuid-999",
      "amount": 100.00,
      "reason": "Customer migration"
    },
    "unusedCredit": 100.00,
    "daysRemaining": 15,
    "totalDaysInCycle": 30,
    "message": "Subscription cancelled successfully"
  }
  ```

---

### 5. Hybrid Order Combined Invoice
**`GET /orders/:orderId/invoice`** (also `GET /subscriptions/orders/:orderId/invoice`)

Aggregates one-time `QuotationLines` and recurring `Subscriptions`. One-time and recurring totals are distinctly separated in the response.

- **Response `200 OK`**:
  ```json
  {
    "orderId": "quote-uuid-123",
    "quoteNumber": "QT-2026-001",
    "oneTimeTotal": 1000.00,
    "recurringTotal": 300.00,
    "combinedInvoiceTotal": 1300.00,
    "quotationLines": [
      {
        "id": "line-1",
        "productId": "prod-1",
        "productName": "IoT Gateway Hardware",
        "quantity": 2,
        "unitPrice": 500.00,
        "discount": 0,
        "totalPrice": 1000.00
      }
    ],
    "subscriptions": [
      {
        "id": "sub-1",
        "planName": "Cloud Connectivity SaaS",
        "billingCycle": "MONTHLY",
        "pricePerCycle": 150.00,
        "quantity": 2,
        "cycleTotal": 300.00,
        "status": "ACTIVE",
        "currentPeriodStart": "2026-01-01T00:00:00.000Z",
        "currentPeriodEnd": "2026-02-01T00:00:00.000Z"
      }
    ],
    "upcomingSchedule": [
      {
        "id": "bse-2",
        "subscriptionId": "sub-1",
        "planName": "Cloud Connectivity SaaS",
        "billingDate": "2026-02-01T00:00:00.000Z",
        "amount": 300.00,
        "status": "UPCOMING",
        "description": "Billing Cycle 2 (MONTHLY)"
      }
    ],
    "creditNotes": []
  }
  ```

---

## Discount Governance Endpoints (`/discounts`, `/backend/discounts`)

### 1. Discount Tier CRUD
**`POST /discounts/tiers`** *(Admin Only)*

Creates a customer discount tier setting maximum discount percentage allowed for that tier.

- **Headers**: `Authorization: Bearer <ADMIN_JWT>`, `Content-Type: application/json`
- **Request Body**:
  ```json
  {
    "customerTier": "GOLD",
    "maxDiscountPercent": 15.0
  }
  ```
  *Allowed `customerTier` values*: `BRONZE`, `SILVER`, `GOLD`

- **Response `201 Created`**:
  ```json
  {
    "id": "tier-uuid-123",
    "customerTier": "GOLD",
    "maxDiscountPercent": 15.0,
    "createdAt": "2026-09-05T12:00:00.000Z",
    "updatedAt": "2026-09-05T12:00:00.000Z"
  }
  ```

- **Related Tier Routes**:
  - `GET /discounts/tiers` (List all tiers, Admin only)
  - `GET /discounts/tiers/:id` (Get tier by ID, Admin only)
  - `PUT /discounts/tiers/:id` (Update tier, Admin only)
  - `DELETE /discounts/tiers/:id` (Delete tier, Admin only)

---

### 2. Category Discount Ceiling CRUD
**`POST /discounts/categories`** (also `/discounts/category-ceilings`) *(Admin Only)*

Defines maximum discount percentage allowed for a product category.

- **Headers**: `Authorization: Bearer <ADMIN_JWT>`, `Content-Type: application/json`
- **Request Body**:
  ```json
  {
    "category": "Service",
    "maxDiscountPercent": 10.0
  }
  ```

- **Response `201 Created`**:
  ```json
  {
    "id": "category-uuid-456",
    "category": "Service",
    "maxDiscountPercent": 10.0,
    "createdAt": "2026-09-05T12:00:00.000Z",
    "updatedAt": "2026-09-05T12:00:00.000Z"
  }
  ```

- **Related Category Routes**:
  - `GET /discounts/categories` (List all category ceilings, Admin only)
  - `GET /discounts/categories/:id` (Get ceiling by ID, Admin only)
  - `PUT /discounts/categories/:id` (Update ceiling, Admin only)
  - `DELETE /discounts/categories/:id` (Delete ceiling, Admin only)

---

### 3. Approval Chain CRUD
**`POST /discounts/approval-chains`** *(Admin Only)*

Defines risk score threshold range and required approval role.

- **Headers**: `Authorization: Bearer <ADMIN_JWT>`, `Content-Type: application/json`
- **Request Body**:
  ```json
  {
    "minRiskScore": 0.1,
    "maxRiskScore": 5.0,
    "requiredApprovers": "MANAGER"
  }
  ```
  *Allowed `requiredApprovers` values*: `MANAGER`, `MANAGER_THEN_FINANCE`

- **Response `201 Created`**:
  ```json
  {
    "id": "chain-uuid-789",
    "minRiskScore": 0.1,
    "maxRiskScore": 5.0,
    "requiredApprovers": "MANAGER",
    "createdAt": "2026-09-05T12:00:00.000Z",
    "updatedAt": "2026-09-05T12:00:00.000Z"
  }
  ```

- **Related Approval Chain Routes**:
  - `GET /discounts/approval-chains` (List all chains, Admin only)
  - `GET /discounts/approval-chains/:id` (Get chain by ID, Admin only)
  - `PUT /discounts/approval-chains/:id` (Update chain, Admin only)
  - `DELETE /discounts/approval-chains/:id` (Delete chain, Admin only)

---

### 4. Calculate Risk Score
**`POST /discounts/calculate-risk`**

Evaluates quotation line discounts against category discount ceilings, computes order-weighted blended risk score, and determines required approval chain.

- **Formula**:
  $$\text{line Overage}_i = \max(0, \text{discountPercent}_i - \text{categoryCeiling}_i)$$
  $$\text{blendedRiskScore} = \sum_{i} \left( \text{line Overage}_i \times \frac{\text{lineTotal}_i}{\text{orderTotal}} \right)$$

- **Headers**: `Content-Type: application/json`
- **Request Body**:
  ```json
  {
    "customerTier": "GOLD",
    "lines": [
      {
        "category": "Hardware",
        "discountPercent": 12,
        "lineTotal": 800.00
      },
      {
        "category": "Service",
        "discountPercent": 18,
        "lineTotal": 200.00
      }
    ]
  }
  ```

- **Response `200 OK`**:
  ```json
  {
    "blendedRiskScore": 1.6,
    "flaggedLines": [
      {
        "category": "Service",
        "discountPercent": 18,
        "categoryCeiling": 10,
        "overage": 8,
        "lineTotal": 200.00
      }
    ],
    "requiredApprovalChain": "MANAGER"
  }
  ```

- **Zero Overage Response `200 OK`**:
  ```json
  {
    "blendedRiskScore": 0,
    "flaggedLines": [],
    "requiredApprovalChain": null
  }
  ```

- **Error Responses**:
  - `400 Bad Request`: `customerTier` or line `category` not found in configuration.
    ```json
    { "error": "Customer tier 'PLATINUM' not found in discount tier configuration" }
    ```

---

## Upsell & Cross-Sell Engine Endpoints (`/upsell`, `/backend/upsell`)

### 1. UpsellRule CRUD
**`POST /upsell/rules`** *(Admin Only)*

Defines an upsell/cross-sell pairing between a trigger product and a suggested product.

- **Headers**: `Authorization: Bearer <ADMIN_JWT>`, `Content-Type: application/json`
- **Request Body**:
  ```json
  {
    "triggerProductId": "prod-laptop-uuid",
    "suggestedProductId": "prod-dock-uuid",
    "coPurchaseScore": 0.85,
    "isPromoted": false,
    "isActive": true
  }
  ```

- **Response `201 Created`**:
  ```json
  {
    "id": "rule-uuid-123",
    "triggerProductId": "prod-laptop-uuid",
    "suggestedProductId": "prod-dock-uuid",
    "coPurchaseScore": 0.85,
    "isPromoted": false,
    "isActive": true,
    "createdAt": "2026-09-05T14:00:00.000Z",
    "updatedAt": "2026-09-05T14:00:00.000Z"
  }
  ```

- **Related UpsellRule Routes**:
  - `GET /upsell/rules` (List all rules; supports `?triggerProductId=...&isActive=true`)
  - `GET /upsell/rules/:id` (Get rule by ID)
  - `PUT /upsell/rules/:id` or `PATCH /upsell/rules/:id` (Update rule, Admin only)
  - `DELETE /upsell/rules/:id` (Delete rule, Admin only)

---

### 2. Get Quotation Upsell Recommendations
**`GET /upsell/:quotationId`**

Looks up products currently in the quotation cart, retrieves matching pairing rules, filters out items below minimum margin threshold, excludes items already in cart, de-duplicates multiple trigger rules, and ranks results by `isPromoted` (true first) followed by `coPurchaseScore` descending.

- **Query Parameters**:
  - `minMarginThreshold` *(optional, Float)*: Minimum required product `marginPercent` (e.g. `20` for 20%). Defaults to `0` if not specified.

- **Response `200 OK`**:
  ```json
  [
    {
      "productId": "prod-warranty-uuid",
      "productName": "3-Year Extended Care Warranty",
      "marginDelta": 210.00,
      "isPromoted": true,
      "coPurchaseScore": 0.70
    },
    {
      "productId": "prod-dock-uuid",
      "productName": "Thunderbolt 4 Docking Station",
      "marginDelta": 75.00,
      "isPromoted": false,
      "coPurchaseScore": 0.90
    },
    {
      "productId": "prod-mouse-uuid",
      "productName": "Ergonomic Wireless Mouse",
      "marginDelta": 20.00,
      "isPromoted": false,
      "coPurchaseScore": 0.60
    }
  ]
  ```

- **Special Behaviors / Edge Cases**:
  - **No lines in quotation**: Returns `[]` (`200 OK`) without error.
  - **Already in cart**: Products currently in the quotation are excluded.
  - **De-duplication**: When multiple cart items trigger the same suggested product, only the highest-ranked pairing instance is returned.
  - **Margin contribution formula**: `marginDelta = product.basePrice * (product.marginPercent / 100)`.

- **Error Responses**:
  - `404 Not Found`: Quotation ID not found.
    ```json
    { "error": "Quotation not found" }
    ```

---

## Approval Workflow Engine Endpoints (`/approvals`, `/backend/approvals`)

### 1. Submit Quotation for Approval
**`POST /approvals/submit`**

Submits a quotation for approval risk evaluation. Calls risk calculation internally. If no approval is required (`requiredApprovalChain` is null), marks the quote `READY_FOR_FULFILLMENT` and logs an audit log entry. If approval is required, creates an `ApprovalRequest` with `currentStep: "MANAGER"` and updates quote status to `PENDING_APPROVAL`.

- **Headers**: `Authorization: Bearer <JWT>`, `Content-Type: application/json`
- **Request Body**:
  ```json
  {
    "quotationId": "quote-uuid-123",
    "customerTier": "GOLD"
  }
  ```

- **Response `200 OK` (Approval Required)**:
  ```json
  {
    "requiresApproval": true,
    "approvalRequestId": "req-uuid-456",
    "currentStep": "MANAGER"
  }
  ```

- **Response `200 OK` (Auto-Approved / No Approval Required)**:
  ```json
  {
    "requiresApproval": false
  }
  ```

- **Error Responses**:
  - `400 Bad Request`: Missing `quotationId`.
  - `404 Not Found`: Quotation not found.

---

### 2. Process Approval Action
**`POST /approvals/:id/action`**

Approves, rejects, or returns an approval request for revision. Role matching `currentStep` is enforced. Updates `ApprovalRequest` status, advances multi-step chains (`MANAGER` -> `FINANCE`), logs an `ApprovalStepRecord`, and creates a compliance `AuditLog` entry.

- **Headers**: `Authorization: Bearer <JWT>`, `Content-Type: application/json`
- **Request Body**:
  ```json
  {
    "action": "APPROVED",
    "reason": "Discount overage is within acceptable margin threshold"
  }
  ```
  *Allowed `action` values*: `APPROVED`, `REJECTED`, `RETURNED_FOR_REVISION`

- **Response `200 OK` (Step Advanced)**:
  ```json
  {
    "id": "req-uuid-456",
    "quotationId": "quote-uuid-123",
    "blendedRiskScore": 7.5,
    "requiredApprovers": "MANAGER_THEN_FINANCE",
    "currentStep": "FINANCE",
    "status": "PENDING",
    "stepRecords": [
      {
        "id": "step-uuid-1",
        "approverRole": "MANAGER",
        "approverId": "user-manager-id",
        "action": "APPROVED",
        "reason": "Discount overage is within acceptable margin threshold",
        "createdAt": "2026-09-05T12:05:00.000Z"
      }
    ]
  }
  ```

- **Response `200 OK` (Final Approval Completed)**:
  ```json
  {
    "id": "req-uuid-456",
    "quotationId": "quote-uuid-123",
    "currentStep": "COMPLETED",
    "status": "APPROVED"
  }
  ```

- **Error Responses**:
  - `400 Bad Request`: Invalid action or missing reason for `REJECTED`/`RETURNED_FOR_REVISION`.
  - `403 Forbidden`: User role does not match `currentStep`.
  - `409 Conflict`: Request is already completed/rejected or concurrent action collision.

---

### 3. Reopen Approval (On Re-Negotiation)
**`POST /approvals/:quotationId/reopen`**

Internal endpoint called when a negotiated counter-offer changes quotation terms. Re-evaluates risk score. If approval threshold is exceeded, creates a fresh `ApprovalRequest` regardless of previous approval status, and logs a negotiation audit entry.

- **Headers**: `Authorization: Bearer <JWT>`, `Content-Type: application/json`
- **Request Body**:
  ```json
  {
    "customerTier": "GOLD"
  }
  ```

- **Response `200 OK`**:
  ```json
  {
    "requiresApproval": true,
    "approvalRequestId": "new-req-uuid-789",
    "currentStep": "MANAGER"
  }
  ```

---

### 4. Approval History Audit Trail
**`GET /approvals/:quotationId/history`**

Fetches all `ApprovalStepRecord`s and compliance `AuditLog` entries for a quotation ordered chronologically.

- **Headers**: `Authorization: Bearer <JWT>`

- **Response `200 OK`**:
  ```json
  {
    "quotationId": "quote-uuid-123",
    "approvalRequests": [
      {
        "id": "req-uuid-456",
        "blendedRiskScore": 7.5,
        "requiredApprovers": "MANAGER_THEN_FINANCE",
        "currentStep": "COMPLETED",
        "status": "APPROVED",
        "stepRecords": []
      }
    ],
    "stepRecords": [],
    "auditLogs": []
  }
  ```

---

## Reporting & Deal Health Analytics Endpoints (`/reports`, `/backend/reports`)

### 1. Filtered Quotations Report
**`GET /reports/quotations`**

Retrieves a paginated and filtered list of quotations matching all provided criteria (`AND` logic).

- **Query Parameters**:
  - `from` *(optional, ISO Date String)*: Start creation date filter.
  - `to` *(optional, ISO Date String)*: End creation date filter.
  - `salesRepId` *(optional, String)*: Filter by Sales Rep user ID.
  - `teamId` *(optional, String)*: Filter by Sales Rep team ID.
  - `approvalStatus` or `status` *(optional, String)*: Filter by quotation status (`DRAFT`, `SUBMITTED`, `ACCEPTED`, `REJECTED`, etc.).
  - `category` *(optional, String)*: Filter quotations containing products of this category.
  - `page` *(optional, Integer, default `1`)*: Page number.
  - `limit` *(optional, Integer, default `20`)*: Page size (max `100`).

- **Response `200 OK`**:
  ```json
  {
    "quotations": [
      {
        "id": "quote-uuid-001",
        "quoteNumber": "QT-2026-001",
        "userId": "user-uuid-123",
        "salesRep": {
          "id": "user-uuid-123",
          "name": "Jane Doe",
          "email": "jane@dealflow360.com",
          "teamId": "ENTERPRISE-EAST"
        },
        "customerName": "Acme Corp",
        "status": "ACCEPTED",
        "totalAmount": 15000.00,
        "linesCount": 2,
        "lines": [
          {
            "id": "line-1",
            "productId": "prod-1",
            "productName": "Enterprise Server Node",
            "category": "Hardware",
            "quantity": 5,
            "unitPrice": 3000.00,
            "discount": 0,
            "totalPrice": 15000.00
          }
        ],
        "targetDeliveryDate": "2026-10-01T00:00:00.000Z",
        "actualDeliveryDate": null,
        "createdAt": "2026-09-01T10:00:00.000Z",
        "updatedAt": "2026-09-05T12:00:00.000Z"
      }
    ],
    "totalCount": 1,
    "page": 1,
    "limit": 20,
    "totalPages": 1
  }
  ```

---

### 2. Export Quotation Report
**`GET /reports/export`**

Exports the filtered quotation report directly into downloadable file format.

- **Query Parameters**: Same filters as `/reports/quotations` + `format=pdf|xlsx|csv` (default `pdf`).
- **Response Headers**:
  - For PDF: `Content-Type: application/pdf`, `Content-Disposition: attachment; filename="quotations-report.pdf"`
  - For XLSX: `Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`, `Content-Disposition: attachment; filename="quotations-report.xlsx"`
  - For CSV: `Content-Type: text/csv`, `Content-Disposition: attachment; filename="quotations-report.csv"`
- **Response**: Binary file stream or CSV text stream.
- **Edge Case**: If the filtered query returns 0 rows, generates a valid file containing table headers without erroring.

---

### 3. Deal Health Dashboard Analytics
**`GET /reports/deal-health`**

Aggregates operational deal health metrics across all active quotations.

- **Query Parameters**:
  - `stalledDays` *(optional, Integer, default `5`)*: Inactivity threshold in days for non-terminal deals.
  - `discountAnomalyMultiplier` *(optional, Float, default `1.5`)*: Anomaly threshold multiplier above rep's historical average.
  - `minHistoryFloor` *(optional, Integer, default `3`)*: Minimum deals required before evaluating anomaly detection.

- **Response `200 OK`**:
  ```json
  {
    "stalledDeals": [
      {
        "quotationId": "quote-uuid-stalled",
        "quoteNumber": "QT-2026-STALLED",
        "customerName": "Stalled Prospect Inc",
        "salesRepId": "user-uuid-bob",
        "salesRepName": "Bob Smith",
        "status": "DRAFT",
        "daysInactive": 9,
        "updatedAt": "2026-08-27T10:00:00.000Z",
        "totalAmount": 5000.00
      }
    ],
    "discountAnomalies": [
      {
        "quotationId": "quote-uuid-anomaly",
        "quoteNumber": "QT-2026-ANOMALY",
        "customerName": "Large Discount Corp",
        "salesRepId": "user-uuid-bob",
        "salesRepName": "Bob Smith",
        "status": "SUBMITTED",
        "discountPercent": 30.00,
        "repAvgDiscount": 10.00,
        "anomalyRatio": 3.00,
        "totalAmount": 1400.00,
        "createdAt": "2026-09-05T11:00:00.000Z"
      }
    ],
    "deliverySlippage": [
      {
        "quotationId": "quote-uuid-slipped",
        "quoteNumber": "QT-2026-SLIPPED",
        "customerName": "Delayed Delivery Corp",
        "salesRepName": "Alice Wonder",
        "status": "ACCEPTED",
        "daysSlipped": 4,
        "targetDeliveryDate": "2026-09-01T00:00:00.000Z",
        "actualDeliveryDate": null,
        "totalAmount": 3500.00
      }
    ]
  }
  ```

---

### 4. Deal Health Nudge Escalation
**`POST /reports/deal-health/:quotationId/nudge`**

Triggers an escalation nudge action for a stalled deal or anomaly by logging an `AuditLog` entry.

- **Request Body**:
  ```json
  {
    "message": "Please follow up with customer regarding pending approval",
    "escalationType": "MANAGER_ESCALATION",
    "targetRole": "MANAGER"
  }
  ```

- **Response `200 OK`**:
  ```json
  {
    "success": true,
    "message": "Nudge escalation sent successfully for quotation QT-2026-STALLED",
    "quotationId": "quote-uuid-stalled",
    "quoteNumber": "QT-2026-STALLED",
    "actionId": "audit-log-uuid-456",
    "timestamp": "2026-09-05T14:40:00.000Z"
  }
  ```

---

## Product Catalog Endpoints (`/products`, `/backend/products`)

### 1. List Products (With Category & Search Filters)
**`GET /products`**

Lists products with optional category filtering and search string matching against name, SKU, or description.

- **Query Parameters**:
  - `category` (String, optional): Filter by exact category (e.g. `Hardware`, `Services`, `Subscriptions`).
  - `search` (String, optional): Case-insensitive string search against product name, SKU, or description (e.g. `laptop`).

- **Response `200 OK`**:
  ```json
  [
    {
      "id": "prod-uuid-1",
      "sku": "HW-WKS-01",
      "name": "Pro Workstation Laptop",
      "description": "Mobile workstation with dedicated GPU",
      "category": "Hardware",
      "basePrice": 1500.00,
      "unit": "PCS",
      "tax": 10.0,
      "marginPercent": 25.0,
      "currency": "USD",
      "variants": [
        {
          "id": "variant-uuid-1",
          "attribute": "Storage",
          "value": "1TB SSD",
          "extraPrice": 150.00
        }
      ],
      "priceLists": []
    }
  ]
  ```

---

### 2. Create Product (With Optional Nested Variants)
**`POST /products`** *(Admin Only)*

Creates a new product in the catalog with optional nested variants.

- **Headers**: `Authorization: Bearer <ADMIN_JWT>`, `Content-Type: application/json`
- **Request Body**:
  ```json
  {
    "sku": "HW-SRV-01",
    "name": "Enterprise Rack Server",
    "description": "Dual-socket 2U rack server",
    "category": "Hardware",
    "basePrice": 2500.00,
    "unit": "PCS",
    "tax": 10.0,
    "marginPercent": 30.0,
    "currency": "USD",
    "variants": [
      {
        "attribute": "RAM",
        "value": "64GB",
        "extraPrice": 200.00
      }
    ]
  }
  ```

- **Response `201 Created`**:
  ```json
  {
    "id": "prod-uuid-2",
    "sku": "HW-SRV-01",
    "name": "Enterprise Rack Server",
    "category": "Hardware",
    "basePrice": 2500.00,
    "marginPercent": 30.0,
    "variants": []
  }
  ```

- **Error Responses**:
  - `400 Bad Request`: `basePrice` or `marginPercent` is negative.
  - `403 Forbidden`: User is not an Admin.

---

### 3. Product Price Resolution
**`GET /products/:id/price?customerTier=GOLD&currency=USD`**

Resolves final tier-aware price and currency conversion for a product. Looks up `PriceList` for tier+currency overrides; falls back to FX rate converted base price.

- **Query Parameters**:
  - `customerTier` (String, optional): `BRONZE`, `SILVER`, `GOLD`
  - `currency` (String, optional): Target currency (e.g. `USD`, `EUR`, `GBP`, `CAD`, `INR`)

- **Response `200 OK` (Override Matched)**:
  ```json
  {
    "productId": "prod-uuid-1",
    "productName": "Enterprise Rack Server",
    "customerTier": "GOLD",
    "currency": "USD",
    "basePrice": 2500.00,
    "overridePrice": 2200.00,
    "resolvedPrice": 2200.00,
    "currencyConverted": false
  }
  ```

- **Response `200 OK` (FX Converted)**:
  ```json
  {
    "productId": "prod-uuid-1",
    "productName": "Enterprise Rack Server",
    "customerTier": "SILVER",
    "currency": "EUR",
    "basePrice": 2500.00,
    "overridePrice": null,
    "resolvedPrice": 2300.00,
    "currencyConverted": true
  }
  ```

---

### 4. Delete Product
**`DELETE /products/:id`** *(Admin Only)*

Deletes a product from the catalog. Blocks deletion with `409 Conflict` if the product is referenced in existing quotations or price lists.

- **Headers**: `Authorization: Bearer <ADMIN_JWT>`

- **Error Response `409 Conflict`**:
  ```json
  { "error": "Cannot delete product 'prod-uuid-1' because it is referenced in existing quotations or price lists" }
  ```

---

## Warehouses & Multi-Location Fulfillment Endpoints (`/warehouses`)

### 1. List Warehouses with Stock Inventory
**`GET /warehouses`**

Returns all active warehouses with inventory stock records.

- **Response `200 OK`**:
  ```json
  [
    {
      "id": "wh-uuid-1",
      "name": "East Coast DC",
      "code": "WH-EAST",
      "location": "Newark, NJ",
      "capacity": 10000,
      "isActive": true,
      "stockItems": [
        {
          "id": "stock-uuid-1",
          "productId": "prod-uuid-1",
          "quantity": 3,
          "allocatedQty": 0,
          "product": {
            "id": "prod-uuid-1",
            "sku": "HW-SENSOR-IOT",
            "name": "Telemetry Sensor Pack"
          }
        }
      ]
    }
  ]
  ```

---

### 2. Update Stock Inventory
**`POST /warehouses/:id/stock`** *(Admin Only)*

Sets the on-hand quantity for a product in a warehouse.

- **Headers**: `Authorization: Bearer <ADMIN_JWT>`, `Content-Type: application/json`
- **Request Body**:
  ```json
  {
    "productId": "prod-uuid-1",
    "quantity": 15
  }
  ```
- **Response `200 OK`**:
  ```json
  {
    "id": "stock-uuid-1",
    "warehouseId": "wh-uuid-1",
    "productId": "prod-uuid-1",
    "quantity": 15,
    "allocatedQty": 0
  }
  ```

---

### 3. Preview Fulfillment Split
**`GET /warehouses/suggest-split/:quotationId`**

Simulates fulfillment split allocation across warehouses without reserving stock.

- **Response `200 OK`**:
  ```json
  {
    "quotation": { "id": "quote-uuid-1", "quoteNumber": "Q-2026-001" },
    "suggestions": [
      {
        "productId": "prod-uuid-1",
        "productName": "Telemetry Sensor Pack",
        "warehouseId": "wh-uuid-1",
        "warehouseName": "East Coast DC",
        "warehouseCode": "WH-EAST",
        "quantity": 3,
        "status": "ALLOCATED"
      },
      {
        "productId": "prod-uuid-1",
        "productName": "Telemetry Sensor Pack",
        "warehouseId": "wh-uuid-2",
        "warehouseName": "West Coast DC",
        "warehouseCode": "WH-WEST",
        "quantity": 4,
        "status": "ALLOCATED"
      },
      {
        "productId": "prod-uuid-1",
        "productName": "Telemetry Sensor Pack",
        "warehouseId": null,
        "warehouseName": "Backorder Center",
        "warehouseCode": "BACKORDER",
        "quantity": 3,
        "status": "BACKORDERED"
      }
    ],
    "fullyAllocated": false,
    "totalRequested": 10,
    "totalAllocated": 7,
    "totalBackordered": 3
  }
  ```

---

### 4. Execute Fulfillment Split
**`POST /warehouses/fulfill/:quotationId`**

Executes fulfillment: generates `StockAllocation` records, increments `allocatedQty` on `WarehouseStock`, and updates Quotation status (`ALLOCATED` or `PARTIALLY_ALLOCATED`).

- **Response `200 OK`**:
  ```json
  {
    "quotationId": "quote-uuid-1",
    "quoteNumber": "Q-2026-001",
    "status": "PARTIALLY_ALLOCATED",
    "fulfillmentSummary": {
      "fullyAllocated": false,
      "totalItemsRequested": 10,
      "allocatedItems": 7,
      "backorderedItems": 3
    },
    "allocations": [
      {
        "id": "alloc-uuid-1",
        "quotationId": "quote-uuid-1",
        "warehouseId": "wh-uuid-1",
        "productId": "prod-uuid-1",
        "quantity": 3,
        "status": "ALLOCATED",
        "productName": "Telemetry Sensor Pack",
        "warehouseName": "East Coast DC",
        "warehouseCode": "WH-EAST"
      }
    ]
  }
  ```

---

## Unified Order Invoicing Endpoints (`/orders/:orderId/invoice`)

### 1. Hybrid Order / Quotation Combined Invoice
**`GET /orders/:orderId/invoice`** (or `GET /subscriptions/orders/:orderId/invoice`)

Generates a unified invoice aggregating both one-time quotation line items and recurring subscription schedules without requiring client-side calculation.

- **Response `200 OK`**:
  ```json
  {
    "orderId": "quote-uuid-1",
    "quoteNumber": "Q-2026-001",
    "oneTimeTotal": 4100.00,
    "recurringTotal": 250.00,
    "combinedInvoiceTotal": 4350.00,
    "quotationLines": [
      {
        "id": "line-uuid-1",
        "productId": "prod-uuid-1",
        "productName": "Enterprise App Server",
        "quantity": 1,
        "unitPrice": 4000.00,
        "discount": 20.0,
        "totalPrice": 3200.00
      }
    ],
    "subscriptions": [
      {
        "id": "sub-uuid-1",
        "planName": "Enterprise Cloud Fleet License",
        "billingCycle": "MONTHLY",
        "pricePerCycle": 250.00,
        "quantity": 1,
        "cycleTotal": 250.00,
        "status": "ACTIVE"
      }
    ],
    "upcomingSchedule": [
      {
        "id": "sched-uuid-1",
        "planName": "Enterprise Cloud Fleet License",
        "billingDate": "2026-10-05T00:00:00.000Z",
        "amount": 250.00,
        "status": "UPCOMING"
      }
    ],
    "creditNotes": []
  }
  ```

---

## Inter-Module Workflow & Wiring Agreement

1. **Wire Approval $\rightarrow$ Fulfillment**:
   - Frontend or automated pipeline triggers `POST /warehouses/fulfill/:quotationId` upon `APPROVED` quotation status.
   - The engine automatically resolves stock across all warehouses, reserves inventory, and tracks backorders.
2. **Wire Fulfillment $\rightarrow$ Billing**:
   - Frontend or customer portal requests `GET /orders/:orderId/invoice` once an order is placed/fulfilled.
   - Subscriptions and hardware line items are automatically partitioned into one-time vs recurring charges.







