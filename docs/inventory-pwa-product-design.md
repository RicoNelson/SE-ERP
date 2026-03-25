# Inventory PWA Product Design

## Overview

This document defines a simple inventory and sales web app with PWA support for a small electronics store. The product is designed for a store owner who is not comfortable using a laptop and needs a mobile-first, highly simplified interface. It also supports store staff so product stock can be deducted immediately during each sale instead of being adjusted later from invoices.

## Problem Statement

The current workflow is manual:

- Sales happen in the store
- Invoices are reviewed afterward
- Sold products are manually deducted from stock
- Stock levels can become inaccurate or outdated
- The process depends heavily on the owner remembering to update inventory

This creates delays, stock mistakes, and extra work.

## Product Vision

Build a mobile-friendly inventory and sales app that is as simple as possible to use on a phone or tablet, while still covering the core business needs:

- Record sales quickly
- Deduct inventory instantly
- Add stock from supplier invoices
- Show current stock clearly
- Alert when stock is running low
- Keep owner control and visibility

## Target Users

### Store Owner

Primary user with limited technical comfort.

Needs:

- Very simple interface
- Clear stock visibility
- Easy supplier stock entry
- Easy review of what was sold
- Confidence that staff updates are correct

### Store Staff

Secondary user who needs speed.

Needs:

- Fast sales entry
- Minimal taps
- Easy product search or barcode scan
- Clear confirmation that stock was deducted

## Core Goals

### Business Goals

- Reduce manual inventory work
- Improve stock accuracy
- Prevent stockouts for fast-selling items
- Let staff update stock at the moment of sale

### User Goals

- Complete a sale update in seconds
- Check product stock without paperwork
- Add new stock from supplier invoices without confusion

## Core Workflows

### 1. Record Sale and Deduct Stock

1. Staff opens the Sell screen
2. Staff searches product or scans barcode
3. Staff taps quantity sold
4. Staff confirms the sale
5. Stock is deducted immediately
6. Sale is saved to history

### 2. Add Stock from Supplier Invoice

1. Owner opens the Stock In screen
2. Owner selects supplier
3. Owner adds products and quantities from invoice
4. Owner confirms received stock
5. Inventory increases immediately
6. Purchase record is saved

### 3. Check Stock Status

1. Owner opens the Stock screen
2. Owner sees product list with quantity and low-stock status
3. Owner filters by low stock, category, or supplier
4. Owner decides what to reorder

### 4. Correct Mistakes

1. Owner opens recent activity
2. Owner finds the incorrect transaction
3. Owner undoes the last sale or makes an adjustment
4. System logs who made the correction and why

## MVP Scope

### Must Have

- Product catalog
- Current stock quantity per product
- Sales entry with automatic stock deduction
- Supplier stock entry
- Low-stock alerts
- User roles for owner and staff
- Transaction history
- Stock adjustment with audit trail
- Mobile-first PWA installation

### Should Have

- Barcode scanning
- Daily sales summary
- Supplier-based purchase history
- Search by product name, SKU, or barcode

### Could Have Later

- Invoice photo to stock entry
- Profit dashboard
- Multi-branch support
- WhatsApp low-stock alerts
- Recommended reorder suggestions

## Feature Requirements

### Product Catalog

Each product should store:

- Product name
- SKU
- Barcode
- Category
- Supplier
- Cost price
- Selling price
- Current quantity
- Low-stock threshold
- Status: active or inactive

### Sales Module

- Add one or more products to a sale
- Change quantity quickly with large plus and minus controls
- Confirm sale with one clear action
- Deduct stock immediately after confirmation
- Show success feedback after save
- Support sale cancellation or undo for recent transactions

### Stock In Module

- Add stock by supplier invoice
- Support multiple products in one stock-in transaction
- Increase stock immediately
- Save invoice number and date
- Keep purchase history

### Inventory Module

- List all products with stock status
- Highlight low-stock items clearly
- Support search and filters
- Show recent stock movement per product

### Roles and Permissions

#### Owner

- Full access
- Manage products
- Add supplier stock
- Review reports
- Adjust stock
- View audit history

#### Staff

- Create sales
- View limited product stock
- No permission to delete products
- No permission to make unrestricted stock changes

### Reporting

- Daily sales total
- Top-selling products
- Low-stock list
- Recent inventory changes

## UX and UI Principles

The app should be designed for users with low technical confidence.

### Interface Principles

- Large buttons
- Large text
- High color contrast
- Clear labels
- Minimal typing
- Minimal navigation depth
- One main action per screen
- Clear success and error messages

### Navigation Structure

The main navigation should have only three primary tabs:

- Sell
- Stock
- Reports

Optional admin screens can remain hidden behind a simple owner menu.

### Accessibility Guidelines

- Minimum 44x44 tap targets
- Large font sizing
- Avoid crowded tables
- Use icons with text labels
- Use simple language
- Avoid technical jargon

## Recommended Screens

### 1. Home

- Quick access to Sell
- Quick access to Stock
- Low-stock warning summary
- Today sales summary

### 2. Sell

- Search bar
- Scan barcode button
- Large product result cards
- Quantity controls
- Confirm sale button

### 3. Stock

- Product list
- Search and filter
- Low-stock badge
- Product detail entry point

### 4. Stock In

- Supplier selector
- Add product rows
- Quantity input
- Confirm stock received button

### 5. Reports

- Daily sales
- Low-stock products
- Recent adjustments

### 6. Activity Log

- Sales history
- Stock-in history
- Adjustments
- Undo recent action where allowed

## Technical Recommendation

### Frontend

- React
- Vite
- PWA support for installable home-screen experience

Why:

- Fast to build
- Works well on phone and tablet
- Can feel like a simple app
- Easier to maintain and expand later

### Backend

- Firebase Authentication
- Firestore database
- Firebase Storage only if invoice image upload is needed later

Why:

- Real-time sync across devices
- Fast setup for MVP
- Good support for mobile-first apps
- Simple hosting and authentication stack

### Offline Strategy

- Cache core app screens
- Store pending sales locally if internet is unavailable
- Sync automatically when internet returns

This matters because store internet may not always be stable.

## Suggested Data Model

### products

- id
- name
- sku
- barcode
- category
- supplierId
- costPrice
- sellPrice
- stockQty
- lowStockThreshold
- isActive
- createdAt
- updatedAt

### suppliers

- id
- name
- phone
- notes

### sales

- id
- items
- subtotal
- total
- soldBy
- soldAt

### sale_items

- productId
- productNameSnapshot
- quantity
- unitPrice

### purchases

- id
- supplierId
- invoiceNo
- items
- receivedBy
- receivedAt

### stock_movements

- id
- productId
- type
- quantityChange
- referenceId
- referenceType
- reason
- performedBy
- performedAt

### users

- id
- name
- role
- pinCode
- isActive

## Security and Control

- Role-based permissions
- PIN login for quick store use
- Full audit trail for stock changes
- Confirmation before destructive actions
- Undo for recent mistakes

## Success Metrics

- Sale entry takes less than 10 seconds
- Stock accuracy improves significantly over manual process
- Low-stock items are identified before running out
- Staff record most sales directly in the app
- Owner can check stock without paper invoice review

## Risks and Mitigations

### Risk: Staff forget to log sales

Mitigation:

- Keep sale flow very fast
- Use simple daily review report
- Train staff on one standard workflow

### Risk: Owner finds interface confusing

Mitigation:

- Keep only essential screens
- Use large buttons and plain language
- Pilot with real store tasks before full rollout

### Risk: Internet is unstable

Mitigation:

- Add offline-first transaction queue
- Sync automatically later

## Recommended Delivery Plan

### Phase 1: MVP

- Product catalog
- Sales deduction flow
- Stock-in flow
- Low-stock alerts
- Owner and staff roles
- Basic reports

### Phase 2: Workflow Optimization

- Barcode scanning
- Faster product search
- Improved daily summaries
- Better correction flow

### Phase 3: Advanced Features

- Invoice image support
- Profit reporting
- Supplier analytics
- Multi-device operational improvements

## Final Recommendation

The best solution is a simple PWA that behaves like a lightweight mobile app and focuses on two critical actions:

- add stock when products arrive
- deduct stock immediately when a sale happens

This approach removes the current manual invoice-based deduction process, reduces stock mistakes, and allows the store owner to manage the business from a phone with a much simpler experience than a traditional desktop inventory system.
