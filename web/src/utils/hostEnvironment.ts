export type HostEnvironment = "desktop-webview" | "web-iframe" | "standalone";

export function detectHostEnvironment(): HostEnvironment {
	if (typeof window === "undefined") return "standalone";
	if ((window as unknown as { __HOST_WEBVIEW_MARK__?: boolean }).__HOST_WEBVIEW_MARK__) {
		return "desktop-webview";
	}
	try {
		if (window !== window.top) return "web-iframe";
	} catch {
		return "web-iframe";
	}
	return "standalone";
}

export function isPolkadotHostEnvironment() {
	return detectHostEnvironment() !== "standalone";
}
