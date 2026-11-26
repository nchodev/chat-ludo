'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/** The profile lives in the home screen's navigation bar. */
export default function ProfilePage() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/?tab=profile');
  }, [router]);
  return null;
}
