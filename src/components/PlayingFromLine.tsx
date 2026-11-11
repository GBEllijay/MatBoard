import { useEffect, useState, useSyncExternalStore } from 'react';
import { subscribeDriveBinding, readDriveBinding } from '../lib/googleDrive';
import { chooseGymHome, playingFromCopy, probeAdvantageCloud, type GymHomeId } from '../lib/gymHome';
import { readOneDriveBinding, subscribeOneDriveBinding } from '../lib/oneDrive';
import { readCloudLapse } from '../lib/cloudLapse';
import { mediaConductAccepted } from '../lib/mediaConduct';
import { proPlusCloudUnlocked, subscribeProPlusCloud } from '../lib/proPlusCloud';
import { useAdvantageCloudOn } from './useAdvantageCloudOn';

function snapshotHome(cloudBound: boolean): GymHomeId {
  const conduct = typeof localStorage === 'undefined' || mediaConductAccepted(localStorage);
  const plusCloudActive = proPlusCloudUnlocked() && conduct;
  const lapsed = typeof localStorage !== 'undefined' && readCloudLapse(localStorage, Date.now(), plusCloudActive).phase !== 'hidden';
  return chooseGymHome({
    plusCloudActive,
    cloudBound,
    cloudLapsed: lapsed,
    driveConnected: Boolean(readDriveBinding()),
    oneDriveConnected: Boolean(readOneDriveBinding()),
  });
}

/** One sentence naming the gallery the slideshow is using. */
export function PlayingFromLine() {
  const [cloudBound, setCloudBound] = useState(false);
  const cloudOn = useAdvantageCloudOn();
  const home = useSyncExternalStore(
    (listener) => {
      const stopDrive = subscribeDriveBinding(listener);
      const stopOne = subscribeOneDriveBinding(listener);
      const stopCloud = subscribeProPlusCloud(listener);
      return () => {
        stopDrive();
        stopOne();
        stopCloud();
      };
    },
    () => snapshotHome(cloudBound),
    () => 'phone' as GymHomeId,
  );
  useEffect(() => {
    let cancel = false;
    void probeAdvantageCloud().then((bound) => {
      if (!cancel) setCloudBound(bound);
    });
    return () => {
      cancel = true;
    };
  }, []);
  return <p className="playing-from">{playingFromCopy(home, cloudOn)}</p>;
}
