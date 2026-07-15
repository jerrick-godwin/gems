export interface ViteManifestEntry {
  file: string;
  css?: string[];
  imports?: string[];
}

export function publicAssetsFromViteManifest(
  manifest: Record<string, ViteManifestEntry>,
  entryKey = "src/entry-client.tsx"
) {
  const entry = manifest[entryKey];
  if (!entry) throw new Error("Public client entry is missing from the Vite manifest.");

  const stylesheetFiles = new Set(entry.css ?? []);
  const preloadFiles = new Set<string>();
  const visitedImports = new Set<string>();

  const visitImport = (key: string) => {
    if (visitedImports.has(key)) return;
    visitedImports.add(key);

    const imported = manifest[key];
    if (!imported) return;
    preloadFiles.add(imported.file);
    for (const cssFile of imported.css ?? []) stylesheetFiles.add(cssFile);
    for (const nestedImport of imported.imports ?? []) visitImport(nestedImport);
  };

  for (const importedKey of entry.imports ?? []) visitImport(importedKey);

  return {
    clientEntry: `/${entry.file}`,
    stylesheets: [...stylesheetFiles].map((file) => `/${file}`),
    modulePreloads: [...preloadFiles].map((file) => `/${file}`)
  };
}
