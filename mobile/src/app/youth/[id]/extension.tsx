import { useLocalSearchParams } from 'expo-router';
import { YouthExtensionScreen } from '@/components/youth-extension-screen';
import { youthScalar } from '@/lib/youth';
export default function Screen(){const params=useLocalSearchParams();return <YouthExtensionScreen id={youthScalar(params.id)??''}/>;}
