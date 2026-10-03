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
  /** Plain-text preview of the first ~140 characters (list endpoints). */
  excerpt?: string;
  /** Present on owned docs: number of people the doc is shared with. */
  share_count?: number;
  /** Present on shared docs: my role. */
  my_role?: "viewer" | "editor";
}

export interface ShareInfo {
  user: User;
  role: "viewer" | "editor";
  /** Editor-only privilege to invite others (visible to the owner). */
  can_share?: boolean;
  /** ISO timestamp after which the grant lapses; null = never. */
  expires_at?: string | null;
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

export interface DocVersionMeta {
  version_no: number;
  title: string;
  created_at: string;
  created_by: string;
  created_by_name: string;
}

export interface DocVersion extends DocVersionMeta {
  content: unknown;
}

export interface DocDetail {
  document: DocSummary & { content: unknown };
  myRole: "owner" | "editor" | "viewer";
  isOwner: boolean;
  /** True when the current user may invite others (owner or privileged editor). */
  canShare?: boolean;
  shares: ShareInfo[];
  attachments: AttachmentMeta[];
}

export interface ProfileFields {
  title: string;
  bio: string;
  location: string;
  website: string;
}

export interface ProfileStats {
  owned_docs: number;
  shared_with_me: number;
  grants_given: number;
  collaborators: number;
  attachments: number;
}

export interface ProfilePayload {
  user: User;
  profile: ProfileFields;
  stats: ProfileStats;
  recent: DocSummary[];
  member_since: string;
}
