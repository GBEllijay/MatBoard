import { useEffect, useState } from 'react';
import { readGymLogo, subscribeGymLogo } from '../lib/gymLogo';
import { readGymName, subscribeGymName } from '../lib/gymName';

export function useGymLogo(): string | null {
  const [logo, setLogo] = useState<string | null>(() => readGymLogo());
  useEffect(() => subscribeGymLogo(() => setLogo(readGymLogo())), []);
  return logo;
}

export function useGymName(): string {
  const [name, setName] = useState(() => readGymName());
  useEffect(() => subscribeGymName(() => setName(readGymName())), []);
  return name;
}
