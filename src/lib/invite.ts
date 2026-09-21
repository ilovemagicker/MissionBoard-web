/** Same alphabet / format as iOS DataStore.generateInviteCode */
export function generateInviteCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const chunk = (n: number) =>
    Array.from({ length: n }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join(
      ""
    );
  return `MB-${chunk(4)}-${chunk(4)}`;
}
