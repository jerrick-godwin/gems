export function isAdminDocumentPath(pathname: string) {
  return pathname === "/admin" || pathname.startsWith("/admin/");
}
