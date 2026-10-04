import { useLocalSearchParams } from 'expo-router';
import { YouthEditor } from '@/components/youth-editor';
import { youthScalar } from '@/lib/youth';
export default function YouthPage(){const p=useLocalSearchParams();return <YouthEditor id={youthScalar(p.id)??''}/>;}
