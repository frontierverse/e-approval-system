import { useLocalSearchParams } from 'expo-router';
import { DraftEditor } from '@/components/draft-editor';
export default function NewDraft() { const { scopeId } = useLocalSearchParams<{ scopeId?: string | string[] }>(); return <DraftEditor key={typeof scopeId === 'string' ? scopeId : 'new'} localScopeId={scopeId === undefined ? undefined : typeof scopeId === 'string' ? scopeId : ''} />; }
