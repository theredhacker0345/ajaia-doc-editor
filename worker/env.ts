/**
 * Shared environment + row types for the Worker.
 */

export interface UserRow {
  id: string;
  name: string;
  email: string;
  color: string;
}

export interface ShareRoleRow {
  role: "viewer" | "editor";
}

export interface Env {
  Bindings: {
    DB: D1Database;
    ASSETS: Fetcher;
    APP_SECRET: string;
  };
  Variables: {
    user: UserRow;
  };
}
