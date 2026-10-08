export const enUS: Record<string, string> = {
  // Header and General
  'APP.TITLE': 'Software Fix',
  'APP.FULL_TITLE': 'Lenovo Moto Software Fix',
  'APP.SUBTITLE': 'Rescue and Firmware Recovery Tool',
  'STATUS.BRIDGE_CONNECTED': 'Connected',
  'STATUS.BRIDGE_DISCONNECTED': 'Disconnected',
  'STATUS.AUTHENTICATED': 'Lenovo Authenticated',
  'STATUS.NOT_AUTHENTICATED': 'Not Authenticated',
  'THEME.LIGHT': '☀ Light Mode',
  'THEME.DARK': '☾ Dark Mode',
  'LANG.PT': 'Português (BR)',
  'LANG.EN': 'English',

  // Authentication
  'AUTH.TITLE': 'LENOVO AUTHENTICATION',
  'AUTH.DESC': 'Sign in with your Lenovo account to query and download official firmwares.',
  'AUTH.TOKEN_DETECTED': 'Stored token detected. One-click login available.',
  'AUTH.OPEN_SIGN_IN': 'Open Lenovo login and complete sign-in.',
  'AUTH.CHECKING_TOKENS': 'Checking stored tokens...',
  'AUTH.QUICK_LOGIN': 'Quick Login',
  'AUTH.LOGIN_BROWSER': 'Open Lenovo Login',
  'AUTH.LOGIN_EMBEDDED': 'Login inside LMFD',
  'AUTH.LOGIN_EMBEDDED_HINT':
    'Use this if your external browser did not return to LMFD after sign-in.',
  'AUTH.LOGGED_IN_AS': 'Signed in as',
  'AUTH.SIGN_OUT': 'Sign Out',
  'AUTH.REQUIRED_NOTICE': 'Authentication required for Catalog and Connected Device features.',

  // Source Selection
  'SOURCE.TITLE': 'SELECT SOURCE',
  'SOURCE.CONNECTED': 'Connected Device',
  'SOURCE.CONNECTED_VIA_ADB': 'via USB / ADB',
  'SOURCE.CATALOG': 'Model Catalog',
  'SOURCE.CATALOG_DESC': 'Manual search by device model',

  // Workspaces
  'WORKSPACE.TITLE': 'WORKSPACES',
  'WORKSPACE.DOWNLOADS': 'Downloads',
  'WORKSPACE.BACKUP_RESTORE': 'Backup & Restore',
  'WORKSPACE.APP_STORE': 'App Store',
  'WORKSPACE.ABOUT': 'About Software Fix',
  'WORKSPACE.RESCUE': 'Rescue',

  // Connected Device
  'CONNECTED.TITLE': 'Connected Device Lookup',
  'CONNECTED.DESC': 'Query official firmware update for the device connected via USB',
  'CONNECTED.RUN_LOOKUP': '⚡ Run Lookup',
  'CONNECTED.LOOKING_UP': 'Querying Lenovo servers...',
  'CONNECTED.NO_DEVICE': 'No device detected via ADB. Enable USB Debugging in Developer Options.',
  'CONNECTED.MODEL': 'Model',
  'CONNECTED.IMEI': 'IMEI',
  'CONNECTED.SERIAL': 'Serial Number',
  'CONNECTED.CARRIER': 'Carrier/Channel',
  'CONNECTED.BATTERY': 'Battery',
  'CONNECTED.HARDWARE': 'Hardware',

  // Catalog
  'CATALOG.TITLE': 'Catalog Workspace',
  'CATALOG.DESC': 'Filter models, select one, and run firmware lookups',
  'CATALOG.LOAD_LOCAL': 'Load Local',
  'CATALOG.REFRESH': 'Refresh from LMSA',
  'CATALOG.CATEGORY': 'Category',
  'CATALOG.ALL': 'All',
  'CATALOG.PHONE': 'Phone',
  'CATALOG.TABLET': 'Tablet',
  'CATALOG.SMART': 'Smart',
  'CATALOG.READ_SUPPORT': 'Read Support',
  'CATALOG.SUPPORTED': 'Supported',
  'CATALOG.NOT_SUPPORTED': 'Not supported',
  'CATALOG.SEARCH': 'Search Model',
  'CATALOG.SEARCH_PLACEHOLDER': 'model, market, platform...',
  'CATALOG.MODEL': 'Model',
  'CATALOG.MARKET': 'Market Name',
  'CATALOG.PLATFORM': 'Platform',
  'CATALOG.NO_MATCH': 'No models match current filters.',
  'CATALOG.PREV': '← Prev',
  'CATALOG.NEXT': 'Next →',
  'CATALOG.PAGE': 'Page',
  'CATALOG.MATCHES': 'Matches',

  // Firmware & Rescue
  'FIRMWARE.VARIANTS': 'AVAILABLE FIRMWARE VARIANTS',
  'FIRMWARE.PUBLISHED': 'Published',
  'FIRMWARE.MATCH_ID': 'Match ID',
  'FIRMWARE.RECIPE_AVAILABLE': '✓ Official recipe available',
  'FIRMWARE.RECIPE_UNAVAILABLE': '⚠ Recipe unavailable (will fallback to local XML/script)',
  'FIRMWARE.RESCUE_LITE': '⚡ RESCUE LITE',
  'FIRMWARE.DRY_RUN': 'DRY RUN',
  'FIRMWARE.IN_DOWNLOADS': '✓ In Downloads',
  'FIRMWARE.DOWNLOAD': 'Download Package',
  'FIRMWARE.DOWNLOADING': 'Downloading...',
  'FIRMWARE.COMPLETED': 'COMPLETED',
  'FIRMWARE.STARTING': 'STARTING',
  'FIRMWARE.FAILED': 'FAILED',
  'FIRMWARE.USE_LOCAL_ARCHIVE': 'Use local archive',
  'FIRMWARE.LINKING': 'Linking...',
  'FIRMWARE.CANCELLING': 'Cancelling...',
  'FIRMWARE.RUNNING': 'Running...',

  // Rescue Options Dialog
  'RESCUE.TITLE': 'Firmware Rescue (Rescue Lite)',
  'RESCUE.DRY_RUN_TITLE': 'Rescue Dry Run',
  'RESCUE.TRANSPORT': 'Flash Transport',
  'RESCUE.TRANSPORT_DESC': 'Select the flash protocol compatible with device chipset.',
  'RESCUE.DATA_RESET': 'Data Reset',
  'RESCUE.DATA_RESET_DESC_DRY':
    'Choose whether wipe commands should be included in the dry-run command plan.',
  'RESCUE.DATA_RESET_DESC_LIVE': 'Choose whether user data should be wiped during rescue.',
  'RESCUE.STORAGE': 'QDL Storage',
  'RESCUE.BOARD_SERIAL': 'Board Serial (optional)',
  'RESCUE.OPTIONAL': 'Optional',
  'RESCUE.CANCEL': 'Cancel',
  'RESCUE.CONTINUE': 'Continue with Rescue',
  'RESCUE.YES': 'Yes (Factory Reset)',
  'RESCUE.NO': 'No (Preserve Data if possible)',

  // Drivers
  'DRIVER.QUALCOMM_TITLE': 'Qualcomm QDLoader HS-USB 9008 Driver',
  'DRIVER.QUALCOMM_DESC': 'Install Qualcomm QDLoader driver for emergency EDL / Firehose rescue.',
  'DRIVER.UNISOC_TITLE': 'Unisoc SPD USB Driver',
  'DRIVER.UNISOC_DESC': 'Install Spreadtrum / Unisoc USB driver for PAC firmware flashing.',
  'DRIVER.MEDIATEK_TITLE': 'MediaTek USB VCOM Driver',
  'DRIVER.MEDIATEK_DESC': 'Install MediaTek USB driver for connecting to MTK devices.',
  'DRIVER.INSTALL_BTN': 'Install Driver',
  'DRIVER.INSTALLED': 'Driver already installed',
  'DRIVER.INSTALLING': 'Installing driver...',

  // Rescue Console
  'CONSOLE.TITLE': 'Rescue Console',
  'CONSOLE.CANCEL': 'Cancel',
  'CONSOLE.COPY': 'Copy Logs',
  'CONSOLE.CLEAR': 'Clear',
  'CONSOLE.WIPE': 'Wipe',
  'CONSOLE.TRANSPORT': 'Transport',

  // Downloads Panel
  'DOWNLOADS.TITLE': 'Downloads Manager',
  'DOWNLOADS.EMPTY': 'No active or completed downloads.',
  'DOWNLOADS.OPEN_FOLDER': 'Open Downloads Folder',
  'DOWNLOADS.EXTRACT': 'Extract',
  'DOWNLOADS.DELETE': 'Delete',

  // Backup & Restore
  'BACKUP.TITLE': 'Backup & Restore',
  'BACKUP.CREATE': 'Create New Backup',
  'BACKUP.RESTORE': 'Restore Snapshot',
  'BACKUP.SNAPSHOTS': 'Saved Snapshots',

  // App Store
  'APPSTORE.TITLE': 'Lenovo/Moto App Store',
  'APPSTORE.SEARCH_PLACEHOLDER': 'Search applications...',

  // Modals & Common
  'COMMON.CLOSE': 'Close',
  'COMMON.SAVE': 'Save',
  'COMMON.CONFIRM': 'Confirm',
  'COMMON.SELECT_MODULE': 'Select a source module to begin',

  // Storage Management
  'STORAGE.TITLE': 'Disk & ROM Storage Management',
  'STORAGE.FREE_SPACE': 'Available disk space',
  'STORAGE.PACKAGES': 'Downloaded Packages',
  'STORAGE.EXTRACTED': 'Extracted ROMs',
  'STORAGE.CLEAN_BTN': 'Clean Extracted Files',
  'STORAGE.CLEAN_SUCCESS': 'Cleanup complete! Freed %s of disk space.',
  'STORAGE.CLEAN_EMPTY': 'No temporary extracted folders to clean.',

  // Pre-flight Device Checks
  'PREFLIGHT.TITLE': 'Pre-flight Device Check',
  'PREFLIGHT.BATTERY': 'Battery',
  'PREFLIGHT.BATTERY_OK': 'Battery Level OK',
  'PREFLIGHT.BATTERY_LOW': 'Low Battery (< 30%)',
  'PREFLIGHT.BATTERY_WARN':
    'Warning: Battery level is low. Connect charger before flashing to prevent device interruption.',
  'PREFLIGHT.CONNECTED_DEVICE': 'Fastboot Device',
  'PREFLIGHT.NOT_CONNECTED': 'No Fastboot device detected over USB.',
  'PREFLIGHT.CHECK_BTN': 'Check Device Health',

  // Linux Udev Permissions
  'UDEV.TITLE': 'Linux USB Permissions (Udev Rules)',
  'UDEV.DESC':
    'Configure system udev permissions so Fastboot, ADB, and MediaTek/Qualcomm chips work directly without root permissions.',
  'UDEV.STATUS_INSTALLED': 'Udev rules installed and active',
  'UDEV.STATUS_MISSING': 'Udev rules not configured',
  'UDEV.INSTALL_BTN': 'Configure Linux USB Permissions',
  'UDEV.INSTALL_SUCCESS': 'Udev rules successfully installed! USB permissions enabled.',

  // Service Report
  'REPORT.BTN': 'Generate Service Report',
  'REPORT.TITLE': 'Technical Service Receipt',
  'REPORT.SUBTITLE': 'Official Software Maintenance & Flash Report',
  'REPORT.PRINT': 'Print / Save as PDF',
  'REPORT.COPY': 'Copy Report Text',
  'REPORT.COPIED': 'Report copied to clipboard!',
  'REPORT.DATE': 'Execution Date',
  'REPORT.DEVICE': 'Device Model',
  'REPORT.SERIAL': 'Serial Number (SN)',
  'REPORT.FIRMWARE': 'Installed Firmware Version',
  'REPORT.OUTCOME': 'Flash Outcome',
  'REPORT.STATUS_SUCCESS': 'Flash & Upgrade Successfully Completed',
  'REPORT.DATA_PRESERVED': 'User Data Preserved',
  'REPORT.DATA_WIPED': 'Factory Reset Performed',
};
