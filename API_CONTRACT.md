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
        "stepRecords": [...]
      }
    ],
    "stepRecords": [...],
    "auditLogs": [...]
  }
  ```




