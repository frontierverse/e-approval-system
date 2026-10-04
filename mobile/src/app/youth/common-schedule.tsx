import { useLocalSearchParams } from 'expo-router';
import { YouthCommonScreen } from '@/components/youth-common-screen';
import { youthScalar } from '@/lib/youth';
export default function Screen(){const p=useLocalSearchParams();return <YouthCommonScreen weekday={youthScalar(p.weekday)}/>;}
