# TAJ Pharmacy — Installation Guide

> For support staff helping a pharmacy install TAJ Pharmacy for the first time.  
> Estimated time: 15–20 minutes.

---

## 1. System Requirements

| Requirement | Minimum | Recommended |
|-------------|---------|-------------|
| **Operating System** | Windows 10 (64-bit) | Windows 11 (64-bit) |
| **RAM** | 4 GB | 8 GB |
| **Disk Space** | 500 MB free | 2 GB free |
| **Internet** | Required for activation & cloud sync | Stable broadband |
| **Display** | 1024×768 | 1280×768 or higher |

---

## 2. Download & Install

### 2.1 Get the Installer

The installer is distributed via a download link provided by the software supplier.  
**File name**: `TAJ Pharmacy_0.1.0_x64-setup.exe`

### 2.2 Run the Installer

1. Double-click the downloaded `.exe` file.
2. If Windows SmartScreen shows a warning, click **"More info"** → **"Run anyway"**.
3. Follow the NSIS installer steps:
   - Accept the license terms
   - Choose the install location (default `C:\Program Files\TAJ Pharmacy` is fine)
   - Click **Install**
4. When complete, check **"Launch TAJ Pharmacy"** and click **Finish**.

The app will open. The first time it runs, you will see the **Onboarding Wizard**.

---

## 3. First-Time Setup (Onboarding Wizard)

The onboarding wizard is a 4-step process. You must complete it to use the application.

### Step 1 — Pharmacy & Branch Information

| Field | Required | Notes |
|-------|----------|-------|
| **Pharmacy Name** (English) | ✅ | e.g. "Sunrise Pharmacy" |
| **Pharmacy Name** (Arabic) | No | e.g. "صيدلية الشروق" |
| **License Number** | No | Regulatory license number (not the app license key) |
| **Phone Number** | No | Pharmacy contact number |
| **Address** | No | Physical pharmacy address |
| **Currency** | ✅ | Default: Sudanese Pound (SDG). Also supports USD, SAR, AED, EGP |
| **Timezone** | ✅ | Default: Africa/Khartoum |
| **Branch Name** (English) | ✅ | Default: "Main Branch" |
| **Branch Name** (Arabic) | No | Default: "الفرع الرئيسي" |

Click **Next** when done.

### Step 2 — Admin Account

This creates the main admin user for the pharmacy.

| Field | Required | Notes |
|-------|----------|-------|
| **Full Name** (English) | ✅ | e.g. "Ahmed Mohamed" |
| **Full Name** (Arabic) | No | e.g. "أحمد محمد" |
| **Username** | ✅ | e.g. "admin" or "ahmed" — used to log in |
| **Email** | ✅ | Must contain `@` — used for cloud account login |
| **Password** | ✅ | Minimum 6 characters, must contain at least 1 letter + 1 number |
| **Confirm Password** | ✅ | Must match password exactly |

Click **Next** when done.

### Step 3 — License Activation

1. Enter the **license key** provided by the software supplier.
   - Format: `PMS-XXXX-XXXX-XXXX`
2. Click **Activate** — the app will connect to the cloud server and validate the license.
3. If you don't have a license key yet, click **Skip / Activate later** (you can activate later from Settings → License).

Click **Next** when done (or skip).

### Step 4 — Complete

You will see a confirmation screen with:
- Pharmacy name
- Admin username
- Admin email

Click **"Go to Login"** to proceed to the login screen.

---

## 4. First Login

1. Enter the **username** and **password** created in Step 2.
2. Click **Log In**.

The main dashboard will load. The app will automatically start syncing data to the cloud every 5 minutes.

---

## 5. Post-Installation Checks

### 5.1 Verify Cloud Sync (if license was activated)

1. Go to **Settings** → **Cloud Sync** tab.
2. You should see:
   - **Server URL**: `https://taj.systems`
   - **Sync Token**: auto-filled (masked)
   - A green health badge if sync is working
3. Click **"Test Connection"** to verify connectivity to the cloud server.
4. Click **"Sync Now"** to manually trigger a full data push.

### 5.2 Configure Cloud Sync (if license was NOT activated)

1. Go to **Settings** → **Cloud Sync** tab.
2. Enter:
   - **Server URL**: provided by the software supplier
   - **Sync Token**: provided by the software supplier
3. Click **"Save"**.
4. Click **"Test Connection"** — should show success.
5. Click **"Sync Now"** — should complete without errors.

### 5.3 Verify the License Status

1. Go to **Settings** → **License** tab.
2. Confirm:
   - **Status**: "Valid" (green badge)
   - **Plan**: your subscribed plan
   - **Expiry**: a valid future date
   - **Max Branches** / **Max Users**: correct limits

### 5.4 Configure the App

1. Go to **Settings** → **General** tab to verify pharmacy information.
2. Go to **Settings** → **Units** tab to add measurement units (e.g. box, strip, bottle).
3. Go to **Settings** → **Payment** tab to configure:
   - Default tax rate
   - Bank accounts and cash accounts
4. Go to **Settings** → **Backup** tab to create the first backup.

---

## 6. Owner Cloud Dashboard

Once the license is activated and sync is working, the pharmacy owner can access:

- **URL**: `https://taj.systems/`
- **Login**: Use the **email** and **password** from onboarding Step 2.

The Owner Dashboard shows:
- Today's sales, expenses, and balances
- Product list and stock levels
- Sales history
- Supplier accounts and payables

---

## 7. Troubleshooting

| Problem | Solution |
|---------|----------|
| **"Windows protected your PC"** warning | Click "More info" → "Run anyway" |
| **App won't start** | Check Windows is 64-bit. Reinstall. |
| **"Activation failed"** | Check internet connection. Verify license key. |
| **Cloud sync error** | Go to Settings → Cloud Sync → Test Connection. Check firewall/VPN. |
| **Sync shows red health badge** | Check internet connection. Click "Sync Now" to re-establish. |
| **Forgot admin password** | Contact the software supplier for a password reset. |
| **License expired** | Go to Settings → License → enter a new license key and click Activate. |
| **App runs slowly** | Create a backup in Settings → Backup, then restart the app. |

### Check Logs (for advanced support)

Log files are stored in:
```
%APPDATA%/com.taj.pharmacy/logs/
```

---

## 8. Uninstallation

1. Create a final backup: **Settings → Backup → Create Backup**.
2. Close TAJ Pharmacy.
3. Open Windows **Settings → Apps → Installed apps**.
4. Find "TAJ Pharmacy" → click `...` → **Uninstall**.

> Note: The pharmacy database and backups are stored separately and are not deleted during uninstall. They remain in `%APPDATA%/com.taj.pharmacy/` for safe recovery.

---

## 9. Support Contact

| Item | Value |
|------|-------|
| **Cloud Dashboard** | `https://taj.systems/` |
| **Admin Panel** | `https://taj.systems/mgmt` |
| **App version** | 0.1.0 |

For issues not covered here, contact the software supplier with:
- Pharmacy name
- App version (shown at the bottom of the login screen)
- Screenshot of any error message
- Log files from `%APPDATA%/com.taj.pharmacy/logs/`
