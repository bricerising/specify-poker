export function toHttpUrl(target: string): string {
  const trimmed = target.trim();
  if (trimmed.length === 0) {
    return trimmed;
  }

  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    return trimmed;
  }

  return `http://${trimmed}`;
}
