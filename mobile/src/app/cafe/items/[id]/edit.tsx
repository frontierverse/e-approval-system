import { useLocalSearchParams } from 'expo-router';
import { CafeItemEditorScreen } from '@/components/CafeWriteScreens';
import { cafeScalar } from '@/lib/lunch-cafe';
export default function Route() { const {id}=useLocalSearchParams(); const value=cafeScalar(id) ?? ''; return <CafeItemEditorScreen key={value} id={value} />; }
