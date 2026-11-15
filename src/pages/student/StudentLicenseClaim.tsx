import { Navigate, useSearchParams } from 'react-router-dom';
import { ACCOUNT_PATH } from '../../lib/emailLogin';
import { studentAccountInvitePath } from '../../lib/studentLicensePool';

/** Old claim and join routes send the student to the account invite screen. */
export function studentClaimRedirectTo(code: string, email = ''): string {
  const invite = code.trim();
  return invite ? studentAccountInvitePath(invite, email) : ACCOUNT_PATH;
}

/**
 * Older /student/claim/:code path. The form no longer claims without a password;
 * this redirects to /account with the invite filled in so the student can set one.
 */
export function StudentLicenseClaimPage({
  code,
  initialEmail = '',
}: {
  code: string;
  gymName?: string;
  showQr?: boolean;
  initialEmail?: string;
}) {
  return <Navigate to={studentClaimRedirectTo(code, initialEmail)} replace />;
}

/** Older public page at /join/student?code=... . Same redirect as the claim path. */
export function StudentJoinPage() {
  const [params] = useSearchParams();
  const code = params.get('code') ?? params.get('invite') ?? '';
  const initialEmail = params.get('email') ?? '';
  return <Navigate to={studentClaimRedirectTo(code, initialEmail)} replace />;
}
