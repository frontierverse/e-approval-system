import { useLocalSearchParams } from 'expo-router';
import { YouthHistoryScreen } from '@/components/youth-history-screen';
import { youthScalar } from '@/lib/youth';
export default function Screen(){const p=useLocalSearchParams(),a=youthScalar(p.activity),activity=a==='common'||a==='learning'||a==='rules'?a:undefined;const query=activity==='common'?`weekday=${encodeURIComponent(youthScalar(p.weekday)??'')}`:activity==='learning'?`subject=math${p.subunitId?'&subunitId='+encodeURIComponent(youthScalar(p.subunitId)??''):''}`:`target=${encodeURIComponent(youthScalar(p.target)??'all')}&category=${encodeURIComponent(youthScalar(p.category)??'all')}`;return <YouthHistoryScreen id={youthScalar(p.id)??(activity?undefined:'')} activity={activity} query={query} page={youthScalar(p.page)}/>;}
