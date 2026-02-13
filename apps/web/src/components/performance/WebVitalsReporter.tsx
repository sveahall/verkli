"use client";

import { useReportWebVitals } from "next/web-vitals";

type WebVitalsMetric = Parameters<Parameters<typeof useReportWebVitals>[0]>[0];

declare global {
  interface Window {
    __VERKLI_WEB_VITALS__?: (metric: WebVitalsMetric) => void;
  }
}

/**
 * Lightweight Web Vitals reporter.
 * In development we log to the console.
 * In production an optional global handler can forward metrics to analytics.
 */
export default function WebVitalsReporter() {
  useReportWebVitals((metric) => {
    if (process.env.NODE_ENV !== "production") {
      console.debug("[web-vitals]", metric.name, {
        value: metric.value,
        delta: metric.delta,
        rating: metric.rating,
        id: metric.id,
      });
      return;
    }

    window.__VERKLI_WEB_VITALS__?.(metric);
  });

  return null;
}
