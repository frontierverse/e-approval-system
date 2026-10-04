import { useLocalSearchParams } from 'expo-router';
import { YouthDetailScreen } from '@/components/youth-detail-screen';
import { youthScalar } from '@/lib/youth';
export default function YouthPage(){const p=useLocalSearchParams();return <YouthDetailScreen id={youthScalar(p.id)??''}/>;}
