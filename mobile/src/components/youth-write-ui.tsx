/* Privacy guards and immutable mutation baselines deliberately use synchronous refs; permission changes must clear local state before user actions can resume. */

import { useNavigation } from 'expo-router/react-navigation';
import { usePreventRemove } from '@/lib/use-protected-navigation';
import { Text, View } from 'react-native';
import { useTheme } from '@/lib/theme';
import { TextAction } from './ui';
import { useConfirmAction } from './use-confirm-action';
import { youthStyles as s } from './youth-ui';
import type { useYouthMutation } from './youth-mutation';
export function useYouthLeave(dirty:boolean,current:()=>boolean,busy:()=>boolean){
  const navigation=useNavigation(),confirmation=useConfirmAction();
  usePreventRemove(dirty,({data})=>{if(!current()||busy())return;void confirmation.ask({title:'작성 화면 나가기',message:'저장하지 않은 입력이 사라집니다. 결과가 불명확하면 원래 요청의 결과를 먼저 확인하세요.',confirm:'입력 버리고 나가기',danger:true}).then(yes=>{if(yes&&current()&&!busy())navigation.dispatch(data.action);});});
  return confirmation;
}
export function YouthMutationActions<T>({mutation,onRefresh,onAdopt}:{mutation:ReturnType<typeof useYouthMutation<T>>;onRefresh:()=>Promise<void>;onAdopt?:()=>void}) {
  const theme=useTheme();
  if(mutation.state==='idle')return null;
  return <View style={s.section}><Text style={[s.body,{color:theme.secondary}]}>{mutation.state==='uncertain'?'원래 입력과 요청을 보존했습니다. 새 요청을 만들지 않고 원래 결과를 먼저 확인하세요.':'내 입력을 보존했습니다. 최신 내용을 확인한 뒤 수정 기준을 선택하세요.'}</Text>
    {mutation.state==='uncertain'?<><TextAction label="원래 저장 결과 확인" disabled={mutation.busy} onPress={()=>void mutation.check()}/>{mutation.pending.current?.body?<TextAction label="같은 저장 요청 재시도" disabled={mutation.busy} onPress={()=>void mutation.retry()}/>:null}</>:<><TextAction label="최신 내용 확인" disabled={mutation.busy} onPress={()=>void onRefresh()}/>{onAdopt?<TextAction label="입력 유지·최신 기준 선택" disabled={mutation.busy} onPress={onAdopt}/>:null}</>}
  </View>;
}
