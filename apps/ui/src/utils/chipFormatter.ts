export function formatChips(amount: number): string {
  if (amount >= 1_000_000) {
    const millions = amount / 1_000_000;
    return `${millions.toFixed(millions % 1 === 0 ? 0 : 1)}M`;
  }
  if (amount >= 1_000) {
    const thousands = amount / 1_000;
    return `${thousands.toFixed(thousands % 1 === 0 ? 0 : 1)}K`;
  }
  return String(amount);
}

export function formatChipsWithCommas(amount: number): string {
  return amount.toLocaleString('en-US');
}

export function formatBlinds(smallBlind: number, bigBlind: number): string {
  return `${formatChips(smallBlind)}/${formatChips(bigBlind)}`;
}

export function calculatePotOdds(potSize: number, callAmount: number): number {
  if (callAmount <= 0) {
    return 0;
  }
  return callAmount / (potSize + callAmount);
}

export function formatPotOdds(potSize: number, callAmount: number): string {
  const odds = calculatePotOdds(potSize, callAmount);
  if (odds === 0) {
    return 'Free';
  }
  const percentage = (odds * 100).toFixed(1);
  return `${percentage}%`;
}

export function calculatePotSizeBet(potSize: number, fraction: number): number {
  return Math.floor(potSize * fraction);
}
