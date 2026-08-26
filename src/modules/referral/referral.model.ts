import { ObjectId } from 'mongodb';

export interface ReferralModel {
  _id?: ObjectId;
  code: string;
  referrerWallet: string | null;
  referredWallet: string;
  createdAt: Date;
}
