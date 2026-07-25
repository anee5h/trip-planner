# Architecture Specification: User Account, Settings & Help Platform

## 1. User Platform Routes

- `/profile`: User identity, avatar, display name, email, connected auth, travel summary.
- `/settings`: Unified application configuration.
  - **General**: Base Location (Home Station/City), Language, Units (Metric/Imperial).
  - **Travel**: Car mode preference, public transit options, default party size.
  - **Appearance**: Theme selection (System, Light, Dark).
  - **Accessibility**: Reduced motion, high contrast.
  - **Account & Data**: Data export & account deletion.
- `/help`: Documentation & support center.
  - **Getting Started**: Quickstart onboarding guide.
  - **FAQ**: Frequently asked questions.
  - **Keyboard Shortcuts**: Global shortcut cheat sheet.
  - **Changelog**: Release history notes.
  - **Contact**: Direct support channels.

## 2. Avatar Dropdown Menu Specs

Avatar dropdown in header contains:

- 👤 **Profile** (`/profile`)
- ⚙️ **Settings** (`/settings`)
- ❓ **Help** (`/help`)
- 💬 **Send Feedback** (Dialog trigger)
- 🚪 **Sign Out**
