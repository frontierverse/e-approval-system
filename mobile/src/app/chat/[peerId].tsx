import { useLocalSearchParams } from "expo-router";
import { ChatThreadScreen } from "@/components/chat-thread-screen";
import { chatRouteId } from "@/lib/chat";
export default function ChatThreadRoute() { const {peerId}=useLocalSearchParams<{peerId:string|string[]}>(); return <ChatThreadScreen peerId={chatRouteId(peerId)} />; }
