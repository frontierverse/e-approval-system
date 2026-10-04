import { useLocalSearchParams } from 'expo-router';
import { MealMenuScreen } from '@/components/LunchCafeScreens';
import { cafeScalar } from '@/lib/lunch-cafe';
export default function Route() { const {date}=useLocalSearchParams(); const selected=cafeScalar(date); return <MealMenuScreen key={selected ?? 'today'} date={selected} />; }
