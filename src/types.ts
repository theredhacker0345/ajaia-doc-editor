/** Typed shapes shared by the API client and UI components. */

export interface User {
  id: string;
  name: string;
  email: string;
  color: string;
}

export interface DocSummary {
  id: string;
  title: string;
  owner_id: string;
  owner_name: string;
  owner_color: string;
  created_at: string;
  updated_at: string;
  /** Present on owned docs: number of people the doc is shared with. */
  share_count?: number;
  /** Present on shared docs: my role. */
  my_role?: "viewer" | "editor";
}

export interface ShareInfo {
  user: User;
  role: "viewer" | "editor";
  created_at?: string;
}

export interface AttachmentMeta {
  id: string;
  filename: string;
  mime: string;
  size: number;
  uploaded_by: string;
  created_at: string;
}

export interface DocDetail {
  document: DocSummary & { content: unknown };
  myRole: "owner" | "editor" | "viewer";
  isOwner: boolean;
  shares: ShareInfo[];
  attachments: AttachmentMeta[];
}
