import { Component, type ReactNode } from 'react';
export default class RouteErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    if (!this.state.failed) return this.props.children;
    return <section role="alert" className="container mx-auto min-h-[40vh] px-5 py-16">
      <h1 className="text-2xl font-bold">This page could not load</h1>
      <p className="mt-3 text-muted-foreground">Your saved account data is unchanged. Check your connection, then reload this page or use the navigation above.</p>
      <button className="mt-5 rounded-lg bg-primary px-5 py-3 font-bold text-primary-foreground" onClick={() => window.location.reload()}>Reload page</button>
    </section>;
  }
}
