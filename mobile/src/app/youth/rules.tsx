import { useLocalSearchParams } from 'expo-router';
import { YouthRulesScreen } from '@/components/youth-rules-screen';
import { youthScalar } from '@/lib/youth';
export default function Screen(){const p=useLocalSearchParams();return <YouthRulesScreen target={youthScalar(p.target)} category={youthScalar(p.category)} page={youthScalar(p.page)}/>;}
