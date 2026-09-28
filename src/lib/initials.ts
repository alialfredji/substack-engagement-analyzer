export function initials(name: string) {
  return (name.match(/[\p{L}\p{N}]+/gu) ?? [])
    .slice(0, 2)
    .map((part) => Array.from(part)[0])
    .join("")
    .toUpperCase()
}
