import { handleApi } from "../server-dist/server.js";

export default async function handler(req: any, res: any) {
  // Pass the request to the monolith's API handler
  const handled = await handleApi(req, res);
  
  if (!handled) {
    res.status(404).json({ error: "Not found" });
  }
}
