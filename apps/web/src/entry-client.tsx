import { hydrateRoot } from "react-dom/client";
import { PublicApp, type PublicRenderPayload } from "./public/PublicDocument.js";
import "./styles.css";

const stateElement = document.getElementById("__PUBLIC_STATE__");
if (!stateElement?.textContent) throw new Error("Missing server-rendered public state");
const serializedState = stateElement.textContent;
const payload = JSON.parse(serializedState) as PublicRenderPayload;
const root = document.getElementById("public-root");
if (!root) throw new Error("Missing public hydration root");
hydrateRoot(root, <PublicApp initialUrl={payload.url} initialRoute={payload.route} initialTheme={payload.theme} year={payload.year} />, {
  identifierPrefix: "gems-public-",
  onRecoverableError(error) {
    console.error("Hydration mismatch", error);
  }
});

recordWebVitals();

function recordWebVitals() {
  if (Math.random() > 0.05 || !("PerformanceObserver" in window)) return;
  const values: Record<string, number> = {};
  const navigation = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
  if (navigation) values.ttfb = Math.max(0, navigation.responseStart);
  const observers: PerformanceObserver[] = [];
  try {
    let cls = 0;
    const layoutObserver = new PerformanceObserver((list) => {
      for (const entry of list.getEntries() as Array<PerformanceEntry & { hadRecentInput?: boolean; value?: number }>) {
        if (!entry.hadRecentInput) cls += entry.value ?? 0;
      }
      values.cls = cls;
    });
    layoutObserver.observe({ type: "layout-shift", buffered: true });
    observers.push(layoutObserver);
    const lcpObserver = new PerformanceObserver((list) => {
      const entry = list.getEntries().at(-1);
      if (entry) values.lcp = entry.startTime;
    });
    lcpObserver.observe({ type: "largest-contentful-paint", buffered: true });
    observers.push(lcpObserver);
    const eventObserver = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) values.inp = Math.max(values.inp ?? 0, entry.duration);
    });
    eventObserver.observe({ type: "event", buffered: true, durationThreshold: 40 } as PerformanceObserverInit);
    observers.push(eventObserver);
  } catch {
    // Older browsers report the metrics they support.
  }
  const send = () => {
    for (const observer of observers) observer.disconnect();
    if (!Object.keys(values).length) return;
    navigator.sendBeacon("/api/v1/metrics/web-vitals", new Blob([JSON.stringify(values)], { type: "application/json" }));
  };
  window.addEventListener("pagehide", send, { once: true });
}
