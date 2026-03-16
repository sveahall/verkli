"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";

type StepErrorBoundaryProps = {
  stepTitle: string;
  stepKey: string;
  children: ReactNode;
};

type StepErrorBoundaryState = {
  hasError: boolean;
};

export default class StepErrorBoundary extends Component<
  StepErrorBoundaryProps,
  StepErrorBoundaryState
> {
  constructor(props: StepErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): StepErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[marketing wizard step]", {
      step: this.props.stepTitle,
      error: error.message,
      stack: info.componentStack,
    });
  }

  componentDidUpdate(prevProps: StepErrorBoundaryProps) {
    if (prevProps.stepKey !== this.props.stepKey && this.state.hasError) {
      this.setState({ hasError: false });
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <section className="card-base p-6">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-50 dark:bg-amber-950/30">
              <svg
                width="20"
                height="20"
                viewBox="0 0 20 20"
                fill="none"
                className="text-amber-500"
              >
                <path
                  d="M10 6v4m0 4h.01M3.072 17h13.856c1.078 0 1.756-1.148 1.234-2.09L11.234 3.09c-.544-.983-1.924-.983-2.468 0L1.838 14.91C1.316 15.852 1.994 17 3.072 17Z"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
            <div className="min-w-0">
              <h2 className="text-[15px] font-semibold text-slate-900 dark:text-white">
                Något gick fel i steget &ldquo;{this.props.stepTitle}&rdquo;
              </h2>
              <p className="mt-1 text-[13px] text-slate-500 dark:text-white/50">
                Prova att ladda om steget. Om felet kvarstår, ladda om sidan.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => this.setState({ hasError: false })}
            className="btn-primary mt-4"
          >
            Försök igen
          </button>
        </section>
      );
    }

    return this.props.children;
  }
}
