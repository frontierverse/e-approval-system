import { useLocalSearchParams } from 'expo-router';
import { CafeItemDetailScreen } from '@/components/CafeItemDetailScreen';
import { cafeScalar } from '@/lib/lunch-cafe';
export default function Route() { const {id}=useLocalSearchParams(); const value=cafeScalar(id) ?? ''; return <CafeItemDetailScreen key={value} id={value} />; }
