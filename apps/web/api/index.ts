import { handleVercelRequest } from "../server-dist/server.js";

export default async function handler(req: any, res: any) {
  await handleVercelRequest(req, res);
}
