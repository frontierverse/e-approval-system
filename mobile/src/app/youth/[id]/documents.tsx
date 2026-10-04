import { useLocalSearchParams } from 'expo-router';
import { YouthDocumentsScreen } from '@/components/youth-documents-screen';
import { youthScalar } from '@/lib/youth';
export default function Screen(){const p=useLocalSearchParams();return <YouthDocumentsScreen id={youthScalar(p.id)??''}/>;}
