export type ImpersonationReadyMessage = { type: "gems:impersonation-ready"; requestId: string };
export type ImpersonationStartMessage = { type: "gems:impersonation-start"; requestId: string; customToken: string; userId: string; email: string };
export type ImpersonationErrorMessage = { type: "gems:impersonation-error"; requestId: string; message: string };

export function isImpersonationReadyMessage(value: unknown, requestId: string): value is ImpersonationReadyMessage {
  if (!value || typeof value !== "object") return false;
  const message = value as Partial<ImpersonationReadyMessage>;
  return message.type === "gems:impersonation-ready" && message.requestId === requestId;
}

export function isImpersonationStartMessage(value: unknown, requestId: string): value is ImpersonationStartMessage {
  if (!value || typeof value !== "object") return false;
  const message = value as Partial<ImpersonationStartMessage>;
  return message.type === "gems:impersonation-start"
    && message.requestId === requestId
    && typeof message.customToken === "string"
    && message.customToken.length > 0
    && typeof message.userId === "string"
    && typeof message.email === "string";
}

export function isImpersonationErrorMessage(value: unknown, requestId: string): value is ImpersonationErrorMessage {
  if (!value || typeof value !== "object") return false;
  const message = value as Partial<ImpersonationErrorMessage>;
  return message.type === "gems:impersonation-error" && message.requestId === requestId && typeof message.message === "string";
}

export function waitForImpersonationReady(popup: Window, requestId: string, timeoutMs = 15_000) {
  return new Promise<void>((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      window.removeEventListener("message", onMessage);
      reject(new Error("The impersonation tab did not become ready."));
    }, timeoutMs);
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin || event.source !== popup || !isImpersonationReadyMessage(event.data, requestId)) return;
      window.clearTimeout(timeout);
      window.removeEventListener("message", onMessage);
      resolve();
    };
    window.addEventListener("message", onMessage);
  });
}
