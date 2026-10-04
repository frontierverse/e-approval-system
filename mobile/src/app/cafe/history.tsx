import { useLocalSearchParams } from 'expo-router';
import { CafeHistoryScreen } from '@/components/LunchCafeScreens';
import { cafeScalar } from '@/lib/lunch-cafe';
export default function Route() { const {itemId}=useLocalSearchParams(); const id=cafeScalar(itemId); return <CafeHistoryScreen key={id ?? 'all'} itemId={id} />; }
