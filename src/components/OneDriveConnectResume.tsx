import { useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { STUDENT_ONEDRIVE_INTENT_KEY, studentOneDriveReturnPath } from '../lib/academyPathway';
import { dismissOneDriveResume, oneDriveResumeSnapshot } from '../lib/oneDrive';
import { DriveConnectCard } from './DriveConnectCard';
import { Sheet } from './Sheet';

/**
 * Microsoft sends the browser back to this site after OneDrive sign-in.
 * The page that started the tap may have unmounted, so the folder list
 * opens here until the gym picks a folder.
 */
export function OneDriveConnectResume() {
  const { pathname } = useLocation();
  const [mode] = useState(() => oneDriveResumeSnapshot());
  const [studentIntent] = useState(() => {
    try {
      return sessionStorage.getItem(STUDENT_ONEDRIVE_INTENT_KEY);
    } catch {
      return null;
    }
  });
  const [open, setOpen] = useState(mode !== null);
  const back = studentOneDriveReturnPath(studentIntent);
  if (back && !pathname.startsWith('/student/connections')) return <Navigate to={back} replace />;
  if (back) return null;
  if (!open || !mode) return null;
  return (
    <Sheet
      open
      portal
      stacked
      title="Connect with"
      onClose={() => {
        dismissOneDriveResume();
        setOpen(false);
      }}
    >
      <DriveConnectCard resumeMode={mode} />
    </Sheet>
  );
}
