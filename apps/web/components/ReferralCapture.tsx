'use client';

import { useEffect } from 'react';
import { captureReferral } from '@/lib/referral';

export function ReferralCapture() {
  useEffect(captureReferral, []);
  return null;
}
