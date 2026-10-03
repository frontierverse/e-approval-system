import { useLocalSearchParams } from "expo-router";
import { ChatFilePreviewScreen } from "@/components/chat-file-preview-screen";
import { chatRouteId } from "@/lib/chat";
export default function ChatFilePreviewRoute(){const {attachmentId,peerId}=useLocalSearchParams<{attachmentId:string|string[];peerId:string|string[]}>();return <ChatFilePreviewScreen attachmentId={chatRouteId(attachmentId)} peerId={chatRouteId(peerId)} />;}
