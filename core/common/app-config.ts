export interface AppConfig {
  authorizationToken?: string;
  askDesktopIntegration?: boolean;
  pendingOauthContexts?: Array<{
    state: string;
    cookieEntries: Array<[string, string]>;
    createdAtMs: number;
    guid?: string;
    clientUuid?: string;
  }>;
}
