import { useLocalSearchParams } from 'expo-router';
import { CafeItemHoldScreen } from '@/components/CafeWriteScreens';
import { cafeScalar } from '@/lib/lunch-cafe';
export default function Route() { const {id}=useLocalSearchParams(); const value=cafeScalar(id) ?? ''; return <CafeItemHoldScreen key={value} id={value} />; }
