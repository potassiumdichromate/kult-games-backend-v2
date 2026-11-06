export interface KultWorldReferral {
  code: string;
  walletAddress: string;
  createdAt: Date;
}

export interface KultWorldReferralCodeSummary {
  code: string;
  count: number;
}

export interface KultWorldReferralWallet {
  walletAddress: string;
  createdAt: Date;
}
