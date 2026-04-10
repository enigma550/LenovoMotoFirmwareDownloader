export interface RequestOptions {
  raw?: boolean;
  headers?: Record<string, string>;
  method?: string;
  withoutAuth?: boolean;
}
