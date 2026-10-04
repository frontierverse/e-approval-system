import { useLocalSearchParams } from 'expo-router';
import { YouthListScreen } from '@/components/youth-list-screen';
import { youthScalar } from '@/lib/youth';
export default function YouthPage(){const p=useLocalSearchParams();return <YouthListScreen q={youthScalar(p.q)} page={youthScalar(p.page)}/>;}
