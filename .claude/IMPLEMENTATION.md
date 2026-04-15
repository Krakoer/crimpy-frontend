# Crimpy Frontend Implementation

## Overview

This document describes the initial implementation of the Crimpy coach web portal, including authentication and admin functionality.

## Features Implemented

### 1. Landing Page with Authentication

Location: [src/routes/+page.svelte](src/routes/+page.svelte)

Features:

- Login form for existing users
- Registration form for new coaches and regular users
- Tab-based interface switching between login and register
- Coach registration option with validation warning
- Error handling and loading states
- Crimpy-themed design with monospace fonts and sharp borders

### 2. Admin Dashboard

Location: [src/routes/admin/+page.svelte](src/routes/admin/+page.svelte)

Features:

- View all pending coach registration requests
- Approve coach accounts
- Reject coach accounts and revert to regular user
- Protected route (admin only access)
- Real-time status updates
- Formatted date display

### 3. User Dashboard

Location: [src/routes/dashboard/+page.svelte](src/routes/dashboard/+page.svelte)

Features:

- Protected route for authenticated users
- Account status display
- Different views for regular users vs validated coaches
- Logout functionality

### 4. Pending Validation Page

Location: [src/routes/pending-validation/+page.svelte](src/routes/pending-validation/+page.svelte)

Features:

- Information page for coaches awaiting validation
- Account details display
- Logout functionality

## Technical Architecture

### API Client

Location: [src/lib/api/client.ts](src/lib/api/client.ts)

Provides type-safe API communication with the backend:

- Authentication endpoints (login, register)
- Admin endpoints (list pending coaches, validate, reject)
- JWT token management
- Request/response type definitions

### Authentication Store

Location: [src/lib/stores/auth.svelte.ts](src/lib/stores/auth.svelte.ts)

Svelte 5 runes-based state management:

- User authentication state
- Login and register methods
- Logout functionality
- Computed properties for role checking (isAdmin, isCoach, isValidatedCoach)
- LocalStorage persistence

## Design System

The implementation follows the Crimpy design guidelines from the Flutter app:

Colors:

- Primary Orange: #C6613F
- Black: #000000
- White: #FFFFFF
- Status Colors: Success (#4A7C4A), Error (#B85450), Warning (#D4A644)

Typography:

- Monospace font family throughout
- Sharp borders with no rounded corners
- Minimal, clean aesthetic

## Routing

- `/` - Landing page with login/register
- `/admin` - Admin dashboard (admin only)
- `/dashboard` - User/coach dashboard (authenticated users)
- `/pending-validation` - Pending coach validation page

## API Integration

Base URLs:

- Development: http://127.0.0.1:3000
- Production: https://api.portfolio-online.ovh

The API client automatically switches between development and production URLs based on the environment.

Endpoints used:

- POST /auth/login
- POST /auth/register
- GET /api/admin/coaches/pending
- PUT /api/admin/coaches/:id/validate
- PUT /api/admin/coaches/:id/reject

## Running the Application

Development server:

```bash
npm run dev
```

Build for production:

```bash
npm run build
```

Preview production build:

```bash
npm run preview
```

## Next Steps

Future enhancements could include:

- Complete dashboard functionality for coaches
- Trainee management
- Session viewing and feedback
- Planning management
- Profile settings
- Password reset functionality
