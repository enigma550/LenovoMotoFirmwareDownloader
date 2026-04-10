export interface AppConfig {
  authorizationToken?: string;
  askDesktopIntegration?: boolean;
  windowsSoftwareFixHandlerBackup?: {
    command: string;
    source: 'hkcu' | 'hkcr';
    description?: string;
  };
  pendingOauthContexts?: Array<{
    state: string;
    cookieEntries: Array<[string, string]>;
    createdAtMs: number;
    guid?: string;
    clientUuid?: string;
  }>;
}
