/** Default empty TipTap document (one empty paragraph). */
export const EMPTY_DOC_CONTENT = JSON.stringify({
  type: "doc",
  content: [{ type: "paragraph" }],
});

/** Color palette used when a brand-new user is auto-provisioned via sharing. */
export const USER_PALETTE = [
  "#4f46e5",
  "#e8710a",
  "#188038",
  "#9334e6",
  "#d93025",
  "#12b5cb",
  "#f9ab00",
  "#7b1fa2",
];

/** Deterministic color pick so a given email always maps to the same color. */
export function colorForEmail(email: string): string {
  let sum = 0;
  for (const ch of email) sum += ch.charCodeAt(0);
  return USER_PALETTE[sum % USER_PALETTE.length];
}
