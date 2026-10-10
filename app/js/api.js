/* The WEBSITE's version of api.js.

   In the desktop app, api() sends each request to the Grante server running on the computer.
   A website has no server of its own, so here the same requests are answered by backend.js,
   right inside the browser. Every screen calls api() exactly as before and can't tell the difference. */
import { handle, HttpError } from "./backend.js";
import * as files from "./files.js";

export const WEB = true;
export const FILES = files;   // the file tools (Chrome and Edge on a computer)

export class ApiError extends Error {
  constructor(message, status) { super(message); this.status = status; }
}

export const events = { onSignedOut: null, onOnline: null };

export async function api(path, { method = "GET", body } = {}) {
  try {
    const data = await handle(method, path, body);
    events.onOnline?.(true);
    return data;
  } catch (err) {
    if (!(err instanceof HttpError)) {
      console.error(err);
      throw new ApiError("Something went wrong. Refresh the page and try again.", 500);
    }
    if (err.status === 503) events.onOnline?.(false);
    if (err.status === 401 && !path.startsWith("/auth/") && !path.startsWith("/account")) events.onSignedOut?.();
    throw new ApiError(err.message, err.status);
  }
}
