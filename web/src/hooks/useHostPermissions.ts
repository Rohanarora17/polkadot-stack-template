import { useEffect, useState } from "react";
import { enumValue } from "@novasamatech/host-api";
import { hostApi } from "@novasamatech/product-sdk";

import { isPolkadotHostEnvironment } from "../utils/hostEnvironment";

export function useHostPermissions() {
	const [status, setStatus] = useState<
		"standalone" | "idle" | "requesting" | "granted" | "partial" | "failed"
	>(() => (isPolkadotHostEnvironment() ? "idle" : "standalone"));

	useEffect(() => {
		if (!isPolkadotHostEnvironment()) {
			return;
		}

		let cancelled = false;

		async function requestPermission() {
			setStatus("requesting");
			const permissions: Array<
				| { tag: "TransactionSubmit"; value: undefined }
				| { tag: "ExternalRequest"; value: string }
			> = [{ tag: "TransactionSubmit", value: undefined }];
			const relayerOrigin = getRelayerOrigin();
			if (relayerOrigin) {
				permissions.push({ tag: "ExternalRequest", value: relayerOrigin });
			}

			const results = await Promise.allSettled(permissions.map(requestHostPermission));

			if (cancelled) return;

			const grantedCount = results.filter(
				(result) => result.status === "fulfilled" && result.value,
			).length;

			if (grantedCount === results.length) {
				setStatus("granted");
			} else if (grantedCount > 0) {
				setStatus("partial");
			} else {
				setStatus("failed");
			}
		}

		requestPermission().catch(() => {
			if (!cancelled) setStatus("failed");
		});

		return () => {
			cancelled = true;
		};
	}, []);

	return status;
}

function requestHostPermission(permission:
	| { tag: "TransactionSubmit"; value: undefined }
	| { tag: "ExternalRequest"; value: string }) {
	return hostApi.permission(enumValue("v1", permission)).match(
		() => true,
		() => false,
	);
}

function getRelayerOrigin() {
	const relayerUrl = import.meta.env.VITE_RELAYER_URL;
	if (typeof relayerUrl !== "string" || !relayerUrl.trim()) {
		return null;
	}
	try {
		return new URL(relayerUrl).origin;
	} catch {
		return null;
	}
}
