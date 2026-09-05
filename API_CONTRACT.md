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
