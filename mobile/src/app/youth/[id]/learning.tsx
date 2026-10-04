import { useLocalSearchParams } from 'expo-router';
import { YouthLearningScreen } from '@/components/youth-learning-screen';
import { youthScalar } from '@/lib/youth';
export default function Screen(){const p=useLocalSearchParams();return <YouthLearningScreen id={youthScalar(p.id)??''} subunitId={youthScalar(p.subunitId)}/>;}
