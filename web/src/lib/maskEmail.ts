export function maskEmail(email: string): string {
  if (typeof email !== "string" || email.trim() !== email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return "";
  const [local, domain] = email.split("@");
  return `${local[0]}•••@${domain}`;
}
