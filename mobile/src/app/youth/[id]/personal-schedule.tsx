import { useLocalSearchParams } from 'expo-router';
import { YouthPersonalScreen } from '@/components/youth-personal-screen';
import { youthScalar } from '@/lib/youth';
export default function Screen(){const p=useLocalSearchParams();return <YouthPersonalScreen id={youthScalar(p.id)??''} date={youthScalar(p.date)}/>;}
