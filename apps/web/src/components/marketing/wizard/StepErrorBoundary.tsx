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
          <h2 className="text-[16px] font-semibold text-slate-900 dark:text-white">
            Something went wrong in {this.props.stepTitle}
          </h2>
          <p className="mt-2 text-[14px] text-slate-500 dark:text-white/50">
            Retry this step. If it keeps failing, refresh the page.
          </p>
          <button
            type="button"
            onClick={() => this.setState({ hasError: false })}
            className="btn-primary mt-4"
          >
            Retry
          </button>
        </section>
      );
    }

    return this.props.children;
  }
}

