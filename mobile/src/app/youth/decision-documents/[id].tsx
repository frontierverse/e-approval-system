import { useLocalSearchParams } from 'expo-router';
import { YouthDecisionScreen } from '@/components/youth-decision-screen';
import { youthScalar } from '@/lib/youth';
export default function Screen(){const p=useLocalSearchParams();return <YouthDecisionScreen id={youthScalar(p.id)??''} youthId={youthScalar(p.youthId)??''}/>;}
