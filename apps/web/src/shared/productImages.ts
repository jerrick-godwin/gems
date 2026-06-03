export function gemFallbackImageUrl(title: string, summary?: string) {
  const text = `${title} ${summary ?? ""}`.toLowerCase();
  if (text.includes("sapphire")) return "/assets/sapphire.png";
  if (text.includes("ruby")) return "/assets/ruby.png";
  if (text.includes("spinel")) return "/assets/spinel.png";
  return undefined;
}
