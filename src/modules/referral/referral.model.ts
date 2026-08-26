import { ObjectId } from 'mongodb';

export interface ReferralModel {
  _id?: ObjectId;
  code: string;
  referrerWallet: string;
  referredWallet: string;
  createdAt: Date;
}
