# Product Requirements Document: StockMate PWA

## 1. Product Overview

**Product Name:** SE Stock
**Target Platform:** Mobile Web (PWA)
**Target Users:** Store Owner (Primary), Store Staff (Secondary)
**Objective:** Replace manual, invoice-based inventory tracking with a simple, point-of-sale stock deduction system.

## 2. User Roles

| Role      | Description                       | Permissions                                                                        |
| --------- | --------------------------------- | ---------------------------------------------------------------------------------- |
| **Owner** | Store owner managing the business | Full access: Add products, add stock, view all reports, adjust stock, manage users |
| **Staff** | Employee handling daily sales     | Limited access: Create sales, view stock levels, view today's sales                |

## 3. User Stories & Acceptance Criteria

### Epic 1: Authentication & Access
**As a** user, **I want to** log in securely **so that** my actions are tracked and protected.

*   **Story 1.1: Phone Number Login (OTP)**
    *   **Description:** Users log in using their mobile phone number and a One-Time Password (OTP) sent via SMS.
    *   **Acceptance Criteria:**
        *   Login screen prompts for a phone number.
        *   System sends a 6-digit OTP via SMS (using Firebase Phone Auth).
        *   User enters the OTP to verify their identity.
        *   Entering correct OTP logs user in.
        *   Session remains active locally (persists even if the browser/PWA is closed, refreshing automatically for up to a month) unless explicitly logged out.
- **Story 1.2: Role-Based Access Control**
  - **Description:** Staff should only see features they need.
  - **Acceptance Criteria:**
    - Staff logged in do not see "Add Product", "Stock In", or detailed profit reports.
    - Owner logged in sees all tabs and administrative functions.

### Epic 2: Sales & Stock Deduction (Core Flow)

**As a** Staff member, **I want to** record a sale quickly **so that** stock is deducted immediately without manual paperwork.

- **Story 2.1: Search/Select Product for Sale**
  - **Description:** Staff can easily find a product being sold.
  - **Acceptance Criteria:**
    - Search bar allows searching by name or SKU.
    - (Phase 2) Barcode scanner button activates device camera to scan.
    - Tapping a search result adds the item to the current sale cart.
- **Story 2.2: Enter Sold Quantity**
  - **Description:** Staff inputs the number of items sold.
  - **Acceptance Criteria:**
    - Prompt asks "How much product sold?" for the selected item.
    - Input allows entering the exact number sold.
    - Quantity cannot be negative or zero.
    - Warning shown if quantity exceeds current known stock (but sale is still allowed to prevent blocking real-world transactions).
- **Story 2.3: Confirm Sale**
  - **Description:** Staff confirms the transaction to finalize the deduction.
  - **Acceptance Criteria:**
    - Large "Confirm Sale" button is visible at the bottom of the cart.
    - Tapping confirm deducts the stock quantity from the database immediately.
    - Success message appears briefly.
    - Screen resets to empty cart for the next customer.
    - A record is added to `sales` and `stock_movements`.
- **Story 2.4: Undo Recent Sale**
  - **Description:** Staff can correct a mistake made just moments ago.
  - **Acceptance Criteria:**
    - "Recent Sales" view shows today's transactions.
    - Owner (or Staff within 15 minutes of sale) can tap "Undo".
    - Undoing restores the stock quantities and marks the sale as voided.

### Epic 3: Stock Management (Stock In)

**As an** Owner, **I want to** add new stock from supplier invoices **so that** inventory is accurate.

- **Story 3.1: Record Supplier Delivery**
  - **Description:** Owner adds incoming items.
  - **Acceptance Criteria:**
    - "Stock In" screen allows selecting a supplier (optional).
    - Owner searches/selects products and enters received quantities.
    - Owner enters Invoice Number (optional).
    - Tapping "Confirm Receipt" increases stock quantities in the database immediately.
    - A record is added to `purchases` and `stock_movements`.

### Epic 4: Inventory Visibility

**As an** Owner/Staff, **I want to** see current stock levels **so that** I know what is available to sell.

- **Story 4.1: View Stock List**
  - **Description:** View all products and their quantities.
  - **Acceptance Criteria:**
    - "Stock" tab shows a list of all products.
    - Each row shows Product Name, SKU, Price, and Current Quantity.
    - List can be searched by name/SKU.
- **Story 4.2: Low Stock Alerts**
  - **Description:** Easily identify items that need reordering.
  - **Acceptance Criteria:**
    - Items where Current Quantity <= Low-Stock Threshold are highlighted (e.g., red text or badge).
    - Dashboard/Home screen shows a summary count: "X items low on stock".
    - Tapping the summary filters the stock list to show only low-stock items.

### Epic 5: Product Catalog Management

**As an** Owner, **I want to** manage the list of products **so that** the system reflects my actual store offerings.

- **Story 5.1: Add New Product**
  - **Description:** Create a new item in the system.
  - **Acceptance Criteria:**
    - Form includes: Name (required), SKU, Category, Selling Price (required), Cost Price, Low-Stock Threshold.
    - Saving creates the product with an initial stock of 0.
- **Story 5.2: Edit Product**
  - **Description:** Update product details (e.g., price changes).
  - **Acceptance Criteria:**
    - Owner can edit any field of an existing product.
    - Stock quantity CANNOT be edited here (must use "Adjust Stock" feature for audit purposes).
- **Story 5.3: Adjust Stock (Correction)**
  - **Description:** Manually fix a stock discrepancy.
  - **Acceptance Criteria:**
    - Owner selects a product and chooses "Adjust Stock".
    - Owner enters the *new actual quantity*.
    - Owner must select a reason (e.g., "Damaged", "Count Mismatch", "Lost").
    - System logs the change in `stock_movements`.

## 4. Non-Functional Requirements

1.  **Language:**
    *   The entire user interface must be in Bahasa Indonesia. (Documentation remains in English).
2.  **Performance:**
    *   App must load in under 3 seconds on a standard 3G/4G connection.
    *   Sale confirmation must respond in under 1 second.
3.  **Usability & Design Style:**
    *   **Aesthetic:** Modern Minimalist CMS (Clean, flat UI, ample whitespace, subtle borders instead of heavy shadows).
    *   Minimum touch target size: 44x44 CSS pixels.
    *   Primary text size: minimum 16px.
    *   High contrast ratios for text (WCAG AA compliant).
4.  **Reliability (Offline Support - Phase 2):**
    *   If internet drops, the app should allow Staff to continue caching sales locally.
    *   When internet is restored, cached sales automatically sync to the server.
5.  **Security:**
    *   All API endpoints must verify the user's role (Owner vs Staff).

## 5. Future Scope (Not in MVP)

- Barcode scanning via device camera.
- Profit & Loss reporting.
- Supplier database management.
- Receipt printing.

