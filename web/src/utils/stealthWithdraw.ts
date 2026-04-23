export const DEFAULT_WITHDRAW_TRANSFER_GAS = 21_000n;

export function computeWithdrawValue({
	balance,
	gasLimit = DEFAULT_WITHDRAW_TRANSFER_GAS,
	gasPrice,
}: {
	balance: bigint;
	gasLimit?: bigint;
	gasPrice: bigint;
}) {
	const fee = gasLimit * gasPrice;
	if (balance <= fee) {
		throw new Error(
			`Stealth balance ${balance.toString()} is not enough to cover the estimated withdrawal fee ${fee.toString()}.`,
		);
	}

	return {
		fee,
		gasLimit,
		gasPrice,
		transferValue: balance - fee,
	};
}
