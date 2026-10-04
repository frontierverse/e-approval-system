import { useLocalSearchParams } from 'expo-router';
import { YouthHistoryScreen } from '@/components/youth-history-screen';
import { youthScalar } from '@/lib/youth';
export default function Screen(){const params=useLocalSearchParams();return <YouthHistoryScreen id={youthScalar(params.id)??''} page={youthScalar(params.page)}/>;}
