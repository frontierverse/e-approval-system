import { useLocalSearchParams } from 'expo-router';
import { DraftEditor } from '@/components/draft-editor';
export default function EditDraft() { const { id } = useLocalSearchParams<{ id: string | string[] }>(); return <DraftEditor key={typeof id === 'string' ? id : 'invalid'} documentId={typeof id === 'string' ? id : ''} />; }
