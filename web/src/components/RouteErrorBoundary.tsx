import { Component, type ErrorInfo, type ReactNode } from "react";

type Props = {
	children: ReactNode;
	resetKey: string;
};

type State = {
	error: Error | null;
};

export class RouteErrorBoundary extends Component<Props, State> {
	state: State = { error: null };

	static getDerivedStateFromError(error: Error): State {
		return { error };
	}

	componentDidCatch(error: Error, info: ErrorInfo) {
		console.error("[StealthPay] Route crashed", error, info.componentStack);
	}

	componentDidUpdate(prevProps: Props) {
		if (prevProps.resetKey !== this.props.resetKey && this.state.error) {
			this.setState({ error: null });
		}
	}

	render() {
		if (!this.state.error) return this.props.children;

		return (
			<section className="paper-surface space-y-4 p-6">
				<p className="eyebrow">Route recovery</p>
				<h1 className="text-3xl font-display text-ink-950">This screen needs a refresh.</h1>
				<p className="max-w-2xl text-ink-700">
					The product host blocked or interrupted this route. StealthPay kept the app
					alive instead of showing a blank screen. Go back home, then reopen the flow.
				</p>
				<div className="rounded-2xl border border-coral-500/25 bg-coral-50 p-4 text-sm text-coral-900">
					{this.state.error.message}
				</div>
				<a href="#/" className="btn-primary inline-flex">
					Back to home
				</a>
			</section>
		);
	}
}
